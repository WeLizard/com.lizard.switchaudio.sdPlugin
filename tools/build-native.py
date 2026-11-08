"""Compile the native helper from plugin/*.cs and run the Windows validation suite.

Replaces native-150/build-and-test.py, which produced the shipped source through a
chain of exact-text str.replace calls. The real sources now live in plugin/ and are
compiled directly, so the tree you read is the tree that ships.
"""
from pathlib import Path
import hashlib, json, os, queue, re, shutil, subprocess, threading, time

root = Path(__file__).resolve().parents[1]
out = root / 'build'
out.mkdir(exist_ok=True)

sources = sorted((root / 'plugin').glob('*.cs'))
if not sources:
    raise SystemExit('No C# sources found in plugin/')

csc = Path(os.environ['WINDIR']) / 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if not csc.is_file():
    raise SystemExit(f'.NET Framework compiler not found: {csc}')


sdk_roots = [Path(os.environ.get('ProgramFiles(x86)', r'C:\Program Files (x86)')),
             Path(os.environ.get('ProgramFiles', r'C:\Program Files'))]


def newest_winmd():
    hits = [p for root in sdk_roots
            for p in (root / 'Windows Kits/10/UnionMetadata').glob('*/Windows.winmd')
            if p.is_file() and re.fullmatch(r'\d+(\.\d+)+', p.parent.name)]
    if not hits:
        raise SystemExit('Windows SDK UnionMetadata/Windows.winmd not found')
    return sorted(hits, key=lambda p: tuple(int(n) for n in p.parent.name.split('.')))[-1]


def newest_facades():
    hits = [d for root in sdk_roots
            for d in (root / 'Reference Assemblies/Microsoft/Framework/.NETFramework').glob('v4.*/Facades')
            if (d / 'System.Runtime.dll').is_file() and re.fullmatch(r'v\d+(\.\d+)+', d.parent.name)]
    if not hits:
        raise SystemExit('.NET Framework 4.x Facades not found')
    return sorted(hits, key=lambda d: tuple(int(n) for n in d.parent.name[1:].split('.')))[-1]


winmd = newest_winmd()
facades = newest_facades()
winrt_interop = csc.parent / 'System.Runtime.WindowsRuntime.dll'
if not winrt_interop.is_file():
    raise SystemExit(f'WinRT interop assembly not found: {winrt_interop}')

print(f'winmd:   {winmd}')
print(f'facades: {facades}')

exe = out / 'AudioSwitch.exe'
compile_cmd = [str(csc), '/nologo', '/preferreduilang:en-US', '/optimize+', '/platform:anycpu', '/target:exe',
               f'/out:{exe}', f'/r:{winmd}', f'/r:{winrt_interop}',
               *[f'/r:{p}' for p in sorted(facades.glob('*.dll'))],
               *[str(s) for s in sources]]
compiled = subprocess.run(compile_cmd, cwd=out, capture_output=True, timeout=180)
if compiled.returncode != 0:
    print(compiled.stdout.decode('utf-8', 'replace'))
    print(compiled.stderr.decode('utf-8', 'replace'))
    raise SystemExit(f'csc failed with exit code {compiled.returncode}')
if compiled.stdout.strip():
    print(compiled.stdout.decode('utf-8', 'replace').strip())

checks = []


def call(args, success=True):
    result = subprocess.run([str(exe), *args], capture_output=True,
                            encoding='utf-8-sig', timeout=15)
    data = json.loads(result.stdout)
    assert (result.returncode == 0) == success, (args, result.returncode, result.stdout, result.stderr)
    return data


helper_version = call(['version'])['version']
checks.append(f'compiled helper reports {helper_version}')

assert call(['selftest'])['tests'] == 6
checks.append('six ABI/JSON self-tests')

assert call(['telemetry-selftest'])['tests'] == 2
checks.append('notification generation and telemetry serialization self-tests')

# The distributed 1.5.0 helper was quarantined as Trojan:Win32/Bearfoos.A!ml. Synthetic
# keystroke injection was the malware-shaped part of its API surface; keep it out.
for source in sources:
    assert 'keybd_event' not in source.read_text(encoding='utf-8'), f'{source.name} reintroduces synthetic keystrokes'
checks.append('no synthetic keystroke API in native sources')

media_test = call(['media-selftest'])
assert media_test['tests'] >= 4 and media_test['success']
checks.append(f"media self-tests (SMTC available={media_test['available']})")

media = call(['media'])
assert media['success'] and isinstance(media['media']['available'], bool)
if media['media']['available']:
    assert isinstance(media['media']['sessionCount'], int)
checks.append('media status contract')

assert call(['running', 'chrome'], False)['success'] is False
assert call(['launch', 'anything'], False)['success'] is False
assert call(['soundsettings'], False)['success'] is False
checks.append('process launch/enumeration moved out of the native helper')

frame = call(['snapshot-v3'])
assert frame['schemaVersion'] == 3 and frame['success'] and frame['session'] and frame['revision'] == 1
for flow in ['output', 'input']:
    assert isinstance(frame['flows'][flow]['inventory']['complete'], bool)
    assert set(frame['flows'][flow]['defaults']) == {'console', 'multimedia', 'communications'}
assert isinstance(frame['media']['available'], bool)
if frame['media']['available']:
    assert isinstance(frame['media']['sessionCount'], int)
    session = frame['media']['session']
    if session is not None:
        assert isinstance(session['source'], str) and session['source']
        assert set(session['controls']) == {'play', 'pause', 'stop', 'next', 'previous',
                                          'record', 'channelUp', 'channelDown'}
checks.append('snapshot-v3 contract incl. media block (no physical endpoint required)')
(out / 'windows-snapshot.json').write_text(json.dumps(frame, ensure_ascii=False, indent=2), encoding='utf-8')

assert call(['list', 'invalid'], False)['success'] is False
assert call(['appvolume', 'none', 'NaN'], False)['success'] is False
checks.append('invalid arguments rejected before audio mutation')

process = subprocess.Popen([str(exe), 'watch'], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                           stderr=subprocess.PIPE, text=True, encoding='utf-8-sig', bufsize=1)
lines = queue.Queue()


def reader():
    for line in process.stdout:
        lines.put(line)


threading.Thread(target=reader, daemon=True).start()
try:
    first = json.loads(lines.get(timeout=8))
    assert first['schemaVersion'] == 3
    process.stdin.write('x' * 300 + '\nrefresh 2\nrefresh 7\n')
    process.stdin.flush()
    deadline = time.monotonic() + 8
    while True:
        next_frame = json.loads(lines.get(timeout=max(.1, deadline - time.monotonic())))
        assert next_frame['session'] == first['session'] and next_frame['revision'] > first['revision']
        if next_frame['requestId'] >= 7:
            break
    checks.append('watcher refresh fences; oversized input discarded; stable session/increasing revision')
    heartbeat = json.loads(lines.get(timeout=5))
    assert heartbeat['revision'] > next_frame['revision']
    checks.append('watcher heartbeat without audio events')
    process.stdin.close()
    process.wait(timeout=5)
    assert process.returncode == 0
    checks.append('watcher exits on parent stdin EOF')
finally:
    if process.poll() is None:
        process.kill()
        process.wait()

# Keep the relocated copy inside the project: it exercises a Unicode/spaced path
# without littering %TEMP%, and stays within the build directory's AV exclusion.
relocated_dir = out / f'relocate Audio Switch Ж {os.getpid()}'
relocated_dir.mkdir(exist_ok=True)
try:
    relocated = relocated_dir / 'AudioSwitch.exe'
    shutil.copyfile(exe, relocated)
    answer = subprocess.run([str(relocated), 'snapshot-v3'], capture_output=True,
                            encoding='utf-8-sig', timeout=15, check=True)
    assert json.loads(answer.stdout)['schemaVersion'] == 3
    checks.append('native helper runs in a relocated Unicode/spaced path')
finally:
    shutil.rmtree(relocated_dir, ignore_errors=True)

manifest_version = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))['Version']
package = json.loads((root / 'plugin' / 'package.json').read_text(encoding='utf-8'))

report = {
    'helperVersion': helper_version,
    'manifestVersion': manifest_version,
    'packageVersion': package['version'],
    'checks': checks,
    'physicalAudioTested': False,
    'files': {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
              for p in [exe, *sources]},
}
(out / 'native-validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))

assert package['version'] == manifest_version, 'manifest.json and plugin/package.json versions differ'
assert helper_version == manifest_version, f'helper reports {helper_version}, manifest declares {manifest_version}'