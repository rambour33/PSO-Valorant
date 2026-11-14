# Windows audio routing for the RØDECaster stream (no admin, no third-party tool):
#   -Listen  <capture id> <render id>  "Écouter ce périphérique" of an input, played on a given output ("" = off)
#   -AppOut  <exe name>   <render id>  output device of one application (Settings > Volume mixer), "" = back to default
# Ids are the MMDevice ids: {0.0.1.00000000}.{guid} for inputs, {0.0.0.00000000}.{guid} for outputs.
#   -Enable  <id>[,<id>...]           re-enables endpoints disabled in Windows (Sound panel > show disabled devices)
#   -Default <id>                     default output/input for all roles (console, multimedia, communications)
param([string]$Listen, [string]$AppOut, [string]$Target, [string[]]$Enable, [string]$Default)
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
[StructLayout(LayoutKind.Sequential)] public struct PKEY { public Guid fmtid; public int pid; }
[StructLayout(LayoutKind.Explicit, Size = 24)] public struct PV { [FieldOffset(0)] public ushort vt; [FieldOffset(8)] public short b; [FieldOffset(8)] public IntPtr p; }
[ComImport, Guid("f8679f50-850a-41cf-9c72-430f290290c8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IPolicyConfig {
  int GetMixFormat(); int GetDeviceFormat(); int ResetDeviceFormat(); int SetDeviceFormat(); int GetProcessingPeriod(); int SetProcessingPeriod();
  int GetShareMode(); int SetShareMode();
  [PreserveSig] int GetPropertyValue([MarshalAs(UnmanagedType.LPWStr)] string id, int fx, ref PKEY k, out PV v);
  [PreserveSig] int SetPropertyValue([MarshalAs(UnmanagedType.LPWStr)] string id, int fx, ref PKEY k, ref PV v);
  [PreserveSig] int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string id, int role);
  [PreserveSig] int SetEndpointVisibility([MarshalAs(UnmanagedType.LPWStr)] string id, int visible);
}
[ComImport, Guid("870af99c-171d-4f9e-af0d-e63df40c2bc9")] class CPolicyConfigClient { }
[ComImport, Guid("ab3d4648-e242-459f-b02f-541c70306324"), InterfaceType(ComInterfaceType.InterfaceIsIInspectable)]
interface IAudioPolicyConfigFactory {
  int a1(); int a2(); int a3(); int a4(); int a5(); int a6(); int a7(); int a8(); int a9(); int a10(); int a11(); int a12(); int a13();
  int a14(); int a15(); int a16(); int a17(); int a18(); int a19();
  [PreserveSig] int SetPersistedDefaultAudioEndpoint(uint pid, int flow, int role, IntPtr deviceId);
  [PreserveSig] int GetPersistedDefaultAudioEndpoint(uint pid, int flow, int role, out IntPtr deviceId);
}
public static class Rt {
  static readonly Guid LISTEN = new Guid("24dbb0fc-9311-4b3d-9cf0-18ff155639d4");
  [DllImport("combase.dll")] static extern int WindowsCreateString([MarshalAs(UnmanagedType.LPWStr)] string s, int len, out IntPtr h);
  [DllImport("combase.dll")] static extern int WindowsDeleteString(IntPtr h);
  [DllImport("combase.dll")] static extern int RoGetActivationFactory(IntPtr cls, ref Guid iid, [MarshalAs(UnmanagedType.IUnknown)] out object f);
  public static string Listen(string cap, string ren) {
    var pc = (IPolicyConfig)new CPolicyConfigClient();
    var k0 = new PKEY { fmtid = LISTEN, pid = 0 }; var v0 = new PV { vt = 31, p = Marshal.StringToCoTaskMemUni(ren) };
    int h0 = pc.SetPropertyValue(cap, 0, ref k0, ref v0);
    var k1 = new PKEY { fmtid = LISTEN, pid = 1 }; var v1 = new PV { vt = 11, b = (short)(ren.Length > 0 ? -1 : 0) };
    int h1 = pc.SetPropertyValue(cap, 0, ref k1, ref v1);
    return String.Format("listen hr=0x{0:X} 0x{1:X}", h0, h1);
  }
  public static string Enable(string id) {
    var pc = (IPolicyConfig)new CPolicyConfigClient(); return String.Format("enable {0} hr=0x{1:X}", id, pc.SetEndpointVisibility(id, 1));
  }
  public static string SetDefault(string id) {
    var pc = (IPolicyConfig)new CPolicyConfigClient(); return String.Format("default {0} hr=0x{1:X} 0x{2:X} 0x{3:X}", id, pc.SetDefaultEndpoint(id, 0), pc.SetDefaultEndpoint(id, 1), pc.SetDefaultEndpoint(id, 2));
  }
  public static string AppOut(uint pid, string ren) {
    IntPtr cls; WindowsCreateString("Windows.Media.Internal.AudioPolicyConfig", 40, out cls);
    Guid iid = new Guid("ab3d4648-e242-459f-b02f-541c70306324"); object f; int hr = RoGetActivationFactory(cls, ref iid, out f);
    if (hr != 0) return String.Format("factory hr=0x{0:X}", hr);
    var fac = (IAudioPolicyConfigFactory)f; IntPtr h = IntPtr.Zero;
    if (ren.Length > 0) { string full = @"\\?\SWD#MMDEVAPI#" + ren + "#{e6327cad-dcec-4949-ae8a-991e976a79d2}"; WindowsCreateString(full, full.Length, out h); }
    int a = fac.SetPersistedDefaultAudioEndpoint(pid, 0, 0, h), b = fac.SetPersistedDefaultAudioEndpoint(pid, 0, 1, h);
    if (h != IntPtr.Zero) WindowsDeleteString(h);
    return String.Format("appout pid {0} hr=0x{1:X} 0x{2:X}", pid, a, b);
  }
}
"@
foreach ($e in $Enable) { [Rt]::Enable($e) }
if ($Default) { [Rt]::SetDefault($Default) }
if ($Listen) { [Rt]::Listen($Listen, $Target) }
if ($AppOut) {
  $procs = Get-Process -Name $AppOut -ErrorAction SilentlyContinue
  foreach ($p in $procs) { [Rt]::AppOut([uint32]$p.Id, $Target) }
}
