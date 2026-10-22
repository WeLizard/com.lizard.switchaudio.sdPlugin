from pathlib import Path
import hashlib, json, shutil, subprocess, os, queue, threading, time, tempfile

root = Path(__file__).resolve().parents[1]
out = root / 'native-150-output'
out.mkdir(exist_ok=True)
base = (root / 'plugin' / 'AudioSwitch.cs').read_text(encoding='utf-8')
blob = base.encode('utf-8')
assert hashlib.sha1(b'blob ' + str(len(blob)).encode() + b'\0' + blob).hexdigest() == '6aa8c115523c1f8eaea6ec1653ddd1295baff1df', 'Unexpected native baseline'
s = base.replace('struct PropertyKey {','public struct PropertyKey {').replace('class Program {','partial class Program {').replace('const string Version = "1.4.0"','const string Version = "1.5.0"').replace('[STAThread]','[MTAThread]')
s = s.replace('RegisterEndpointNotificationCallback(IntPtr client)', 'RegisterEndpointNotificationCallback([MarshalAs(UnmanagedType.Interface)] IMMNotificationClient client)').replace('UnregisterEndpointNotificationCallback(IntPtr client)', 'UnregisterEndpointNotificationCallback([MarshalAs(UnmanagedType.Interface)] IMMNotificationClient client)')
s = s.replace('if (args.Length == 1 && args[0] == "selftest")', 'if (args.Length == 1 && args[0] == "watch") return Watch();\n                if (args.Length == 1 && args[0] == "snapshot-v2") result = SnapshotV2();\n                else if (args.Length == 1 && args[0] == "telemetry-selftest") result = TelemetrySelfTest();\n                else if (args.Length == 1 && args[0] == "selftest")')
s = s.replace('try { int hr = e.GetDefaultAudioEndpoint(flow, role, out d); return hr < 0 || d == null ? "" : Id(d); }', 'try { int hr = e.GetDefaultAudioEndpoint(flow, role, out d); if (hr == NotFound) return ""; Hr(hr); return Id(d); }')
assert hashlib.sha256(s.encode()).hexdigest() == '6f8ef13fb47a5023d8a8375b5617e5eb87df484e08928e578b695f23ad607427', 'Source differs from release source'
(out / 'AudioSwitch.cs').write_bytes(s.encode('utf-8'))
(out / 'Telemetry.cs').write_bytes((root / 'native-150' / 'Telemetry.cs').read_text(encoding='utf-8').encode('utf-8'))
csc = Path(os.environ['WINDIR']) / 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
subprocess.run([str(csc), '/nologo', '/optimize+', '/platform:anycpu', '/target:exe', '/out:AudioSwitch.exe', 'AudioSwitch.cs', 'Telemetry.cs'], cwd=out, check=True, timeout=60)
exe = out / 'AudioSwitch.exe'
checks = []
def call(args, success=True):
    result = subprocess.run([str(exe), *args], capture_output=True, encoding='utf-8-sig', timeout=15)
    data = json.loads(result.stdout)
    assert (result.returncode == 0) == success, (args, result.returncode, result.stdout, result.stderr)
    return data
assert call(['version'])['version'] == '1.5.0'; checks.append('compiled version 1.5.0')
assert call(['selftest'])['tests'] == 6; checks.append('six existing ABI/JSON self-tests')
assert call(['telemetry-selftest'])['tests'] == 2; checks.append('notification generation and telemetry serialization self-tests')
frame = call(['snapshot-v2'])
assert frame['schemaVersion'] == 2 and frame['success'] and frame['session'] and frame['revision'] == 1
for flow in ['output','input']:
    assert isinstance(frame['flows'][flow]['inventory']['complete'], bool)
    assert set(frame['flows'][flow]['defaults']) == {'console','multimedia','communications'}
checks.append('snapshot-v2 contract on Windows (no physical endpoint required)')
(out / 'windows-snapshot.json').write_text(json.dumps(frame, ensure_ascii=False, indent=2), encoding='utf-8')
assert call(['list','invalid'], False)['success'] is False
assert call(['appvolume','none','NaN'], False)['success'] is False
checks.append('invalid arguments rejected before audio mutation')
process = subprocess.Popen([str(exe),'watch'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8-sig', bufsize=1)
lines = queue.Queue()
def reader():
    for line in process.stdout:
        lines.put(line)
threading.Thread(target=reader, daemon=True).start()
try:
    first = json.loads(lines.get(timeout=8)); assert first['schemaVersion'] == 2
    process.stdin.write('x' * 300 + '\nrefresh 2\nrefresh 7\n'); process.stdin.flush()
    deadline = time.monotonic() + 8
    while True:
        next_frame = json.loads(lines.get(timeout=max(.1,deadline-time.monotonic())))
        assert next_frame['session'] == first['session'] and next_frame['revision'] > first['revision']
        if next_frame['requestId'] >= 7: break
    checks.append('watcher refresh fences; oversized input discarded; stable session/increasing revision')
    heartbeat = json.loads(lines.get(timeout=5)); assert heartbeat['revision'] > next_frame['revision']
    checks.append('watcher heartbeat without audio events')
    process.stdin.close(); process.wait(timeout=5); assert process.returncode == 0
    checks.append('watcher exits on parent stdin EOF')
finally:
    if process.poll() is None: process.kill(); process.wait()
with tempfile.TemporaryDirectory(prefix='Audio Switch Ж ') as directory:
    relocated = Path(directory) / 'AudioSwitch.exe'; shutil.copyfile(exe,relocated)
    answer = subprocess.run([str(relocated),'snapshot-v2'],capture_output=True,encoding='utf-8-sig',timeout=15,check=True)
    assert json.loads(answer.stdout)['schemaVersion'] == 2
checks.append('native helper runs in a relocated Unicode/spaced path')
report = {'version':'1.5.0','checks':checks,'physicalAudioTested':False,'files':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in out.iterdir() if p.suffix in ['.cs','.exe']}}
(out/'native-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
