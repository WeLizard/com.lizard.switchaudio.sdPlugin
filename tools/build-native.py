"""Compile the native helper from plugin/*.cs and run the Windows validation suite.

Replaces native-150/build-and-test.py, which produced the shipped source through a
chain of exact-text str.replace calls. The real sources now live in plugin/ and are
compiled directly, so the tree you read is the tree that ships.
"""
from pathlib import Path
import hashlib, json, os, queue, shutil, subprocess, threading, time

root = Path(__file__).resolve().parents[1]
out = root / 'build'
out.mkdir(exist_ok=True)

sources = sorted((root / 'plugin').glob('*.cs'))
if not sources:
    raise SystemExit('No C# sources found in plugin/')

csc = Path(os.environ['WINDIR']) / 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if not csc.is_file():
    raise SystemExit(f'.NET Framework compiler not found: {csc}')

exe = out / 'AudioSwitch.exe'
subprocess.run(
    [str(csc), '/nologo', '/optimize+', '/platform:anycpu', '/target:exe',
     f'/out:{exe}', *[str(s) for s in sources]],
    cwd=out, check=True, timeout=120,
)

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

frame = call(['snapshot-v2'])
assert frame['schemaVersion'] == 2 and frame['success'] and frame['session'] and frame['revision'] == 1
for flow in ['output', 'input']:
    assert isinstance(frame['flows'][flow]['inventory']['complete'], bool)
    assert set(frame['flows'][flow]['defaults']) == {'console', 'multimedia', 'communications'}
checks.append('snapshot-v2 contract on Windows (no physical endpoint required)')
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
    assert first['schemaVersion'] == 2
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
    answer = subprocess.run([str(relocated), 'snapshot-v2'], capture_output=True,
                            encoding='utf-8-sig', timeout=15, check=True)
    assert json.loads(answer.stdout)['schemaVersion'] == 2
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
# audioHelperVersion is the helper's own declaration; it may lag the plugin version.
declared_helper = package.get('audioHelperVersion', manifest_version)
assert helper_version == declared_helper, f'helper reports {helper_version}, package declares {declared_helper}'