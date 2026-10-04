param([string]$ControlPath, [switch]$Check, [switch]$SelfTest, [switch]$ReleaseTest, [string]$TestTerminalTitle)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Web.Extensions
Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing,System.Web.Extensions -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

public class LearningStudyGuard : ApplicationContext {
    delegate bool EnumProc(IntPtr window, IntPtr param);
    delegate IntPtr KeyProc(int code, IntPtr message, IntPtr data);
    [StructLayout(LayoutKind.Sequential)] struct Rect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] struct Point { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] struct Placement {
        public int Length, Flags, ShowCommand; public Point MinPosition, MaxPosition; public Rect NormalPosition;
    }
    class SavedWindow { public IntPtr Handle; public int Style; public bool TopMost; public Placement Placement; }
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr param);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr window, StringBuilder title, int length);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr window, int command);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window, int command);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr window);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr window, int index);
    [DllImport("user32.dll")] static extern int SetWindowLong(IntPtr window, int index, int value);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr window, IntPtr order, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll")] static extern bool GetWindowPlacement(IntPtr window, ref Placement placement);
    [DllImport("user32.dll")] static extern bool SetWindowPlacement(IntPtr window, ref Placement placement);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int kind, KeyProc callback, IntPtr module, uint thread);
    [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern IntPtr GetModuleHandle(string name);

    readonly string control, status, id, goal;
    readonly long expires;
    long heartbeat;
    readonly JavaScriptSerializer json = new JavaScriptSerializer();
    readonly List<Form> covers = new List<Form>();
    readonly IntPtr terminal;
    List<IntPtr> notes;
    readonly IntPtr noteWindow;
    readonly Rectangle studyBounds;
    readonly List<SavedWindow> savedWindows = new List<SavedWindow>();
    IntPtr lastAllowed;
    readonly Timer timer = new Timer();
    readonly KeyProc keyboard;
    IntPtr hook;
    bool exited;

    static string ProcessName(IntPtr window) {
        uint pid; GetWindowThreadProcessId(window, out pid);
        try { using (var process = Process.GetProcessById((int)pid)) return process.ProcessName; } catch { return ""; }
    }
    static List<IntPtr> Windows(string name) {
        var windows = new List<IntPtr>();
        EnumWindows((window, _) => {
            if (IsWindowVisible(window) && ProcessName(window).Equals(name, StringComparison.OrdinalIgnoreCase)) windows.Add(window);
            return true;
        }, IntPtr.Zero);
        return windows;
    }
    static long Now() { return (long)(DateTime.UtcNow - new DateTime(1970,1,1)).TotalMilliseconds; }
    static string Title(IntPtr window) { var title = new StringBuilder(512); GetWindowText(window, title, title.Capacity); return title.ToString(); }
    static bool Down(int key) { return (GetAsyncKeyState(key) & 0x8000) != 0; }
    Dictionary<string, object> ReadControl() { return json.Deserialize<Dictionary<string, object>>(File.ReadAllText(control)); }
    void Status(bool active, string reason) {
        var value = json.Serialize(new { id = id, active = active, reason = reason, terminal = terminal.ToInt64(), noteWindows = notes.Count,
            layout = "terminal-left-obsidian-right", obsidian = noteWindow.ToInt64(), bounds = studyBounds });
        File.WriteAllText(status + ".tmp", value);
        File.Copy(status + ".tmp", status, true);
        File.Delete(status + ".tmp");
    }
    bool Allowed(IntPtr window) { return window == terminal || window == noteWindow; }
    bool Own(IntPtr window) { foreach (var form in covers) if (form.Handle == window) return true; return false; }
    void Activate(IntPtr window) {
        if (!IsWindow(window)) return;
        if (IsIconic(window)) ShowWindowAsync(window, 9);
        SetForegroundWindow(window);
    }
    void Remember(IntPtr window) {
        var placement = new Placement { Length = Marshal.SizeOf(typeof(Placement)) };
        if (!GetWindowPlacement(window, ref placement)) throw new InvalidOperationException("Cannot save the study window layout.");
        savedWindows.Add(new SavedWindow { Handle = window, Style = GetWindowLong(window, -16),
            TopMost = (GetWindowLong(window, -20) & 8) != 0, Placement = placement });
    }
    void Pin(IntPtr window, Rectangle bounds) {
        var saved = savedWindows.Find(item => item.Handle == window);
        bool restored = IsIconic(window) || IsZoomed(window);
        if (restored) ShowWindow(window, 9);
        // Hide ordinary window controls while preserving each app's own content and tabs.
        int style = saved.Style & ~0x21CF0000;
        bool frameChanged = GetWindowLong(window, -16) != style;
        if (frameChanged) SetWindowLong(window, -16, style);
        Rect rect;
        if (frameChanged || restored || !GetWindowRect(window, out rect) || rect.Left != bounds.Left || rect.Top != bounds.Top
            || rect.Right != bounds.Right || rect.Bottom != bounds.Bottom || (GetWindowLong(window, -20) & 8) == 0) {
            if (!SetWindowPos(window, new IntPtr(-1), bounds.X, bounds.Y, bounds.Width, bounds.Height, 0x30))
                throw new InvalidOperationException("Cannot pin the study windows.");
        }
    }
    void Layout() {
        int leftWidth = studyBounds.Width / 2;
        Pin(terminal, new Rectangle(studyBounds.X, studyBounds.Y, leftWidth, studyBounds.Height));
        Pin(noteWindow, new Rectangle(studyBounds.X + leftWidth, studyBounds.Y, studyBounds.Width - leftWidth, studyBounds.Height));
    }
    void RestoreWindows() {
        foreach (var saved in savedWindows) {
            if (!IsWindow(saved.Handle)) continue;
            SetWindowLong(saved.Handle, -16, saved.Style);
            SetWindowPos(saved.Handle, new IntPtr(saved.TopMost ? -1 : -2), 0, 0, 0, 0, 0x33);
            var placement = saved.Placement;
            SetWindowPlacement(saved.Handle, ref placement);
        }
        savedWindows.Clear();
    }
    void Stop(string reason) {
        if (exited) return;
        exited = true;
        timer.Stop();
        if (hook != IntPtr.Zero) { UnhookWindowsHookEx(hook); hook = IntPtr.Zero; }
        RestoreWindows();
        try { Status(false, reason); } catch { }
        foreach (var form in covers) form.Close();
        ExitThread();
    }
    Form Cover(Screen screen) {
        var form = new Form { Text = "Study lock", FormBorderStyle = FormBorderStyle.None, Bounds = screen.Bounds,
            StartPosition = FormStartPosition.Manual, TopMost = true, ShowInTaskbar = false, BackColor = Color.FromArgb(20,24,30) };
        form.MouseDown += (_, e) => Activate(lastAllowed);
        form.FormClosing += (_, e) => { if (!exited) e.Cancel = true; };
        return form;
    }
    IntPtr Keyboard(int code, IntPtr message, IntPtr data) {
        if (code >= 0 && !exited) {
            int key = Marshal.ReadInt32(data);
            if (key == 0x4C && Down(0x11) && Down(0x12) && Down(0x10)) {
                Stop("emergency-shortcut");
                return new IntPtr(1);
            }
            var current = GetForegroundWindow();
            if (key == 0x5B || key == 0x5C || (Down(0x12) && (key == 0x09 || key == 0x1B || key == 0x20 || key == 0x73))
                || (Down(0x11) && key == 0x1B)) return new IntPtr(1);
            if (!Allowed(current) && !Own(current)) {
                // Don't let a typed answer land in a distracting app during the transition.
                Activate(lastAllowed);
                return new IntPtr(1);
            }
        }
        return CallNextHookEx(hook, code, message, data);
    }
    void Tick(object sender, EventArgs e) {
        if (Now() >= expires) { Stop("90-minute-failsafe"); return; }
        try {
            var value = ReadControl();
            if ((string)value["id"] != id) { Stop("session-changed"); return; }
            if (Convert.ToBoolean(value["release"])) { Stop(value.ContainsKey("reason") ? Convert.ToString(value["reason"]) : "released"); return; }
            heartbeat = Convert.ToInt64(value["heartbeat"]);
            if (Now() - heartbeat > 30000) { Stop("learning-app-unresponsive"); return; }
            notes = Windows("Obsidian");
            if (!IsWindow(terminal) || !IsWindow(noteWindow)) { Stop("required-window-closed"); return; }
            Layout();
            var current = GetForegroundWindow();
            if (Allowed(current)) lastAllowed = current;
            else Activate(lastAllowed);
        } catch (IOException) { if (Now() - heartbeat > 30000) Stop("learning-app-unresponsive"); }
        catch { Stop("guard-error"); }
    }
    LearningStudyGuard(string file, bool selfTest = false) {
        control = Path.GetFullPath(file); status = Path.Combine(Path.GetDirectoryName(control), "status.json");
        var config = ReadControl();
        id = (string)config["id"]; goal = (string)config["goal"]; expires = Convert.ToInt64(config["expires"]);
        heartbeat = Convert.ToInt64(config["heartbeat"]);
        if (expires <= Now() || expires - Now() > 91*60*1000) throw new InvalidOperationException("Study lock expiry is invalid.");
        var terminals = Windows("WindowsTerminal");
        var foreground = GetForegroundWindow();
        IntPtr selected = IntPtr.Zero;
        if (config.ContainsKey("terminalTitle")) {
            foreach (var window in terminals) if (Title(window).Contains((string)config["terminalTitle"])) { selected = window; break; }
        }
        terminal = selected != IntPtr.Zero ? selected : (terminals.Contains(foreground) ? foreground : (terminals.Count == 1 || selfTest && terminals.Count > 0 ? terminals[0] : IntPtr.Zero));
        if (terminal == IntPtr.Zero) throw new InvalidOperationException("Keep the learning terminal in front while starting /lock; close other terminal windows if needed.");
        notes = Windows("Obsidian");
        if (notes.Count == 0) throw new InvalidOperationException("Open Learning Notes / Obsidian before starting /lock.");
        noteWindow = notes[0];
        foreach (var window in notes) if (Title(window).Contains("Learning Vault")) { noteWindow = window; break; }
        studyBounds = Screen.FromHandle(terminal).Bounds;
        lastAllowed = terminal;
        Remember(terminal); Remember(noteWindow);
        keyboard = Keyboard;
        hook = SetWindowsHookEx(13, keyboard, GetModuleHandle(null), 0);
        if (hook == IntPtr.Zero) throw new InvalidOperationException("Windows could not install the study keyboard guard.");
        timer.Interval = 200; timer.Tick += Tick;
        try {
            Layout();
            foreach (var screen in Screen.AllScreens) if (screen.Bounds != studyBounds) {
                var cover = Cover(screen); covers.Add(cover); cover.Show();
            }
            Status(true, "ready");
            Activate(terminal);
            timer.Start();
        } catch { if (hook != IntPtr.Zero) { UnhookWindowsHookEx(hook); hook = IntPtr.Zero; } RestoreWindows(); throw; }
    }
    public static void Check() {
        var terminalInfo = new List<object>();
        SetProcessDPIAware();
        foreach (var window in Windows("WindowsTerminal")) terminalInfo.Add(WindowInfo(window));
        var noteInfo = new List<object>();
        foreach (var window in Windows("Obsidian")) noteInfo.Add(WindowInfo(window));
        Console.WriteLine(new JavaScriptSerializer().Serialize(new { terminalWindows = Windows("WindowsTerminal").Count,
            obsidianWindows = Windows("Obsidian").Count, terminals = terminalInfo, notes = noteInfo, screens = Screen.AllScreens.Length,
            emergency = "Ctrl+Alt+Shift+L", maxMinutes = 90 }));
    }
    static object WindowInfo(IntPtr window) {
        Rect rect; GetWindowRect(window, out rect);
        return new { handle = window.ToInt64(), title = Title(window), left = rect.Left, top = rect.Top,
            width = rect.Right - rect.Left, height = rect.Bottom - rect.Top, style = GetWindowLong(window, -16), topMost = (GetWindowLong(window, -20) & 8) != 0 };
    }
    public static void Run(string file) {
        SetProcessDPIAware();
        Application.EnableVisualStyles();
        using (var guard = new LearningStudyGuard(file)) Application.Run(guard);
    }
    public static void SelfTest(string file, bool releaseEarly, string terminalTitle) {
        SetProcessDPIAware();
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(file)));
        var value = new { id = "five-second-verification", goal = "Five-second study guard verification — releases automatically", terminalTitle = terminalTitle, expires = Now() + 5000, heartbeat = Now(), release = false };
        File.WriteAllText(file, new JavaScriptSerializer().Serialize(value));
        Application.EnableVisualStyles();
        using (var guard = new LearningStudyGuard(file, true)) {
            var original = guard.savedWindows.ToArray();
            string layoutError = null;
            using (var verify = new Timer()) using (var release = new Timer()) {
                verify.Interval = 750;
                verify.Tick += (_, e) => {
                    verify.Stop();
                    int leftWidth = guard.studyBounds.Width / 2;
                    Rect left, right; GetWindowRect(guard.terminal, out left); GetWindowRect(guard.noteWindow, out right);
                    if (left.Left != guard.studyBounds.Left || left.Top != guard.studyBounds.Top || left.Right != guard.studyBounds.Left + leftWidth
                        || left.Bottom != guard.studyBounds.Bottom || right.Left != left.Right || right.Top != left.Top
                        || right.Right != guard.studyBounds.Right || right.Bottom != left.Bottom
                        || (GetWindowLong(guard.terminal, -20) & 8) == 0 || (GetWindowLong(guard.noteWindow, -20) & 8) == 0) {
                        layoutError = "The study windows did not occupy the pinned left and right halves. "
                            + guard.json.Serialize(new { terminal = WindowInfo(guard.terminal), obsidian = WindowInfo(guard.noteWindow), expected = guard.studyBounds });
                        guard.Stop("verification-failed");
                    }
                };
                verify.Start();
                if (releaseEarly) {
                    release.Interval = 1500;
                    release.Tick += (_, e) => {
                        release.Stop();
                        File.WriteAllText(file, new JavaScriptSerializer().Serialize(new { id = value.id, release = true, reason = "passed" }));
                    };
                    release.Start();
                }
                Application.Run(guard);
            }
            if (layoutError != null) throw new InvalidOperationException(layoutError);
            foreach (var saved in original) {
                var restored = new Placement { Length = Marshal.SizeOf(typeof(Placement)) };
                GetWindowPlacement(saved.Handle, ref restored);
                if (GetWindowLong(saved.Handle, -16) != saved.Style || ((GetWindowLong(saved.Handle, -20) & 8) != 0) != saved.TopMost
                    || restored.ShowCommand != saved.Placement.ShowCommand || restored.NormalPosition.Left != saved.Placement.NormalPosition.Left
                    || restored.NormalPosition.Top != saved.Placement.NormalPosition.Top || restored.NormalPosition.Right != saved.Placement.NormalPosition.Right
                    || restored.NormalPosition.Bottom != saved.Placement.NormalPosition.Bottom)
                    throw new InvalidOperationException("The original study window layout was not restored.");
            }
            Console.WriteLine("Verified: Pi left, Obsidian right, both pinned; original window styles and placement restored on release.");
        }
        Console.WriteLine(File.ReadAllText(Path.Combine(Path.GetDirectoryName(Path.GetFullPath(file)), "status.json")));
    }
    protected override void Dispose(bool disposing) {
        if (hook != IntPtr.Zero) UnhookWindowsHookEx(hook);
        RestoreWindows();
        if (disposing) { timer.Dispose(); foreach (var form in covers) form.Dispose(); }
        base.Dispose(disposing);
    }
}
'@
if ($Check) { [LearningStudyGuard]::Check(); exit 0 }
if (-not $ControlPath) { throw 'A study session control path is required.' }
if ($SelfTest -or $ReleaseTest) { [LearningStudyGuard]::SelfTest($ControlPath, $ReleaseTest.IsPresent, $TestTerminalTitle); exit 0 }
[LearningStudyGuard]::Run($ControlPath)
