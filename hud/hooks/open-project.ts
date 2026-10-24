import type { EngineInterface } from 'claude-code'

// The Explorer-style folder picker (IFileOpenDialog with FOS_PICKFOLDERS), owned by the
// window in front (the terminal that was clicked), so it opens on top of it. Prints the
// chosen folder as UTF-8, or nothing when cancelled. `__START__` is the folder it opens in.
const PICKER = String.raw`
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class FolderPicker {
  [ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")] class FileOpenDialog {}
  [ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IFileDialog {
    [PreserveSig] int Show(IntPtr parent);
    void SetFileTypes(uint c, IntPtr f); void SetFileTypeIndex(uint i); void GetFileTypeIndex(out uint i);
    void Advise(IntPtr p, out uint c); void Unadvise(uint c);
    void SetOptions(uint fos); void GetOptions(out uint fos);
    void SetDefaultFolder(IShellItem si); void SetFolder(IShellItem si);
    void GetFolder(out IShellItem si); void GetCurrentSelection(out IShellItem si);
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string n); void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string n);
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string t); void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string t);
    void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string t);
    void GetResult(out IShellItem si);
  }
  [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellItem {
    void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv); void GetParent(out IShellItem si);
    void GetDisplayName(uint sigdn, [MarshalAs(UnmanagedType.LPWStr)] out string name);
  }
  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
  static extern void SHCreateItemFromParsingName(string path, IntPtr pbc, ref Guid riid, out IShellItem si);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  public static string Pick(string start, string title) {
    IFileDialog dialog = (IFileDialog)new FileOpenDialog();
    dialog.SetOptions(0x20 | 0x40);
    dialog.SetTitle(title);
    try {
      Guid shellItem = typeof(IShellItem).GUID;
      IShellItem folder;
      SHCreateItemFromParsingName(start, IntPtr.Zero, ref shellItem, out folder);
      dialog.SetFolder(folder);
    } catch { }
    if (dialog.Show(GetForegroundWindow()) != 0) return "";
    IShellItem result; dialog.GetResult(out result);
    string path; result.GetDisplayName(0x80058000, out path);
    return path;
  }
}
'@
[FolderPicker]::Pick('__START__', '__TITLE__')
`

// A PowerShell single-quoted string holds anything but a single quote, which it doubles.
const psQuote = (s: string) => s.replace(/'/g, "''")

export async function pickFolder($: EngineInterface, start: string, title: string): Promise<string | null> {
  const script = PICKER.replace('__START__', psQuote(start.replace(/\//g, '\\'))).replace('__TITLE__', psQuote(title))
  const ran = await $.process.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-STA', '-Command', script], {
    timeoutMs: 600_000,
  })
  const chosen = ran.stdout.trim()

  return ran.exitCode === 0 && chosen !== '' ? chosen : null
}

// A new Windows Terminal window running `claude` in the folder; a plain PowerShell window without it.
export type Shell = 'cmd' | 'powershell'

// The shell the new window runs `claude` in, kept open after it exits.
const SHELLS: Record<Shell, string[]> = {
  cmd: ['cmd.exe', '/k', 'claude'],
  powershell: ['powershell.exe', '-NoExit', '-Command', 'claude'],
}

export async function launchClaude($: EngineInterface, folder: string, shell: Shell): Promise<boolean> {
  // A trailing backslash would escape wt's closing quote: `C:\` becomes `C:\.`.
  const dir = folder.endsWith('\\') ? `${folder}.` : folder
  try {
    const wt = await $.process.run(['wt.exe', '-w', 'new', '-d', dir, ...SHELLS[shell]], {
      timeoutMs: 15_000,
    })
    if (wt.exitCode === 0) return true
  } catch {
    // No Windows Terminal: fall through.
  }
  try {
    const cmd = await $.process.run(['cmd.exe', '/c', 'start', '""', '/D', dir, ...SHELLS[shell]], {
      timeoutMs: 15_000,
    })

    return cmd.exitCode === 0
  } catch {
    return false
  }
}
