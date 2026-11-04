using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class Hf {
	public delegate bool EnumProc(IntPtr h, IntPtr l);
	[DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
	[DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
	[DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);
	[DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
	[DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
	[DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
	[DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int s);
	[DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
	[DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
	[DllImport("user32.dll")] static extern bool IsZoomed(IntPtr h);
	[DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
	[DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
	[DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int c);
	[DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int w, int hh, uint f);
	[DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
	[DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
	[DllImport("user32.dll")] static extern bool AttachThreadInput(uint a, uint b, bool f);
	[DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
	[DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
	[DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint f);
	[DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO i);
	[DllImport("user32.dll")] static extern bool SetProcessDPIAware();
	[DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
	[DllImport("user32.dll")] static extern uint SendInput(uint n, INPUT[] i, int s);
	[DllImport("user32.dll")] static extern short VkKeyScan(char c);
	[DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LASTINPUT i);
	[DllImport("user32.dll")] static extern int GetSystemMetrics(int i);

	[StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
	[StructLayout(LayoutKind.Sequential)] struct MONITORINFO { public int cb; public RECT M; public RECT W; public uint F; }
	[StructLayout(LayoutKind.Sequential)] struct LASTINPUT { public uint cb; public uint time; }
	[StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx, dy; public uint data, flags, time; public IntPtr extra; }
	[StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort vk, scan; public uint flags, time; public IntPtr extra; }
	[StructLayout(LayoutKind.Explicit)] struct UNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
	[StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public UNION u; }

	public class Win { public long id; public int pid; public string app; public string title; public bool front, minimized, zoomed, full; public int x, y, width, height; }

	static Dictionary<int, string> names = new Dictionary<int, string>();

	public static void Init() { SetProcessDPIAware(); }

	static string AppOf(int pid) {
		string name;
		if (names.TryGetValue(pid, out name)) return name;
		try { name = Process.GetProcessById(pid).ProcessName; } catch { name = ""; }
		names[pid] = name;
		return name;
	}

	public static string Title(long h) {
		var s = new StringBuilder(512);
		GetWindowTextW((IntPtr)h, s, 512);
		return s.ToString();
	}

	static RECT Rect(long h) { RECT r; GetWindowRect((IntPtr)h, out r); return r; }

	static MONITORINFO Monitor(long h) {
		var i = new MONITORINFO(); i.cb = Marshal.SizeOf(i);
		GetMonitorInfo(MonitorFromWindow((IntPtr)h, 2), ref i);
		return i;
	}

	public static bool Full(long h) {
		var r = Rect(h); var m = Monitor(h).M;
		return r.L <= m.L && r.T <= m.T && r.R >= m.R && r.B >= m.B;
	}

	public static long Front() { return (long)GetForegroundWindow(); }

	public static Win Row(long h) {
		uint pid; GetWindowThreadProcessId((IntPtr)h, out pid);
		var r = Rect(h);
		return new Win { id = h, pid = (int)pid, app = AppOf((int)pid), title = Title(h), front = h == Front(), minimized = IsIconic((IntPtr)h), zoomed = IsZoomed((IntPtr)h), full = Full(h), x = r.L, y = r.T, width = r.R - r.L, height = r.B - r.T };
	}

	public static List<Win> Windows() { return Windows(false); }

	public static List<Win> Windows(bool all) {
		var list = new List<Win>();
		int self = Process.GetCurrentProcess().Id;
		EnumWindows((h, l) => {
			if (!IsWindowVisible(h) || GetWindow(h, 4) != IntPtr.Zero || (GetWindowLong(h, -20) & 0x80) != 0) return true;
			int cloaked; DwmGetWindowAttribute(h, 14, out cloaked, 4);
			if (cloaked != 0 && !all) return true;
			var w = Row((long)h);
			if (w.pid == self || w.title == "" || w.title == "Program Manager" || w.width < 120 || w.height < 80) return true;
			list.Add(w);
			return true;
		}, IntPtr.Zero);
		list.Sort((a, b) => b.front.CompareTo(a.front));
		return list;
	}

	static bool Until(int ms, Func<bool> ok) {
		var end = DateTime.Now.AddMilliseconds(ms);
		while (DateTime.Now < end) { if (ok()) return true; Thread.Sleep(30); }
		return ok();
	}

	public static bool Focus(long h) {
		var t = (IntPtr)h;
		if (!IsWindow(t)) return false;
		if (IsIconic(t)) ShowWindow(t, 9);
		if (Front() == h) return true;
		uint none; uint held = GetWindowThreadProcessId(GetForegroundWindow(), out none);
		uint mine = GetCurrentThreadId();
		bool joined = held != 0 && held != mine && AttachThreadInput(mine, held, true);
		Send(new[] { Key(0xE8, false), Key(0xE8, true) });
		BringWindowToTop(t);
		SetForegroundWindow(t);
		if (joined) AttachThreadInput(mine, held, false);
		return Until(500, () => Front() == h);
	}

	public static string Shape(long h, string how, bool browser) {
		var t = (IntPtr)h;
		switch (how) {
			case "full":
				if (Full(h)) return null;
				if (browser) { Press("f11"); return Until(1500, () => Full(h)) ? null : "It did not go full screen."; }
				ShowWindow(t, 3); return Until(800, () => IsZoomed(t) || Full(h)) ? null : "It did not maximise.";
			case "max": ShowWindow(t, 3); return Until(800, () => IsZoomed(t) || Full(h)) ? null : "It did not maximise.";
			case "min": ShowWindow(t, 6); return Until(800, () => IsIconic(t)) ? null : "It did not minimise.";
			case "restore":
				if (browser && Full(h)) { Press("f11"); Until(1200, () => !Full(h)); }
				ShowWindow(t, 9); return Until(800, () => !IsZoomed(t)) ? null : "It did not restore.";
			case "close": PostMessage(t, 0x10, IntPtr.Zero, IntPtr.Zero); return Until(2000, () => !IsWindow(t)) ? null : "It is still open (it may be asking to save).";
			case "left":
			case "right": {
				if (browser && Full(h)) { Press("f11"); Until(1200, () => !Full(h)); Thread.Sleep(200); }
				ShowWindow(t, 9);
				var w = Monitor(h).W; int half = (w.R - w.L) / 2; int x = how == "left" ? w.L : w.L + half;
				SetWindowPos(t, IntPtr.Zero, x, w.T, half, w.B - w.T, 4);
				return Until(800, () => Math.Abs(Rect(h).L - x) < 16) ? null : "It did not move.";
			}
		}
		return how + " is not a window action.";
	}

	public static string Split(long[] ids) {
		var list = new List<long>();
		foreach (var id in ids) if (IsWindow((IntPtr)id) && list.Count < 6) list.Add(id);
		if (list.Count < 2) return "Name at least two open windows to put side by side.";
		var w = Monitor(list[0]).W; int n = list.Count; int cols = n == 4 ? 2 : n, rows = n == 4 ? 2 : 1;
		for (int i = 0; i < n; i++) {
			int c = i % cols, r = i / cols;
			int l = w.L + (w.R - w.L) * c / cols, t = w.T + (w.B - w.T) * r / rows;
			int rr = w.L + (w.R - w.L) * (c + 1) / cols, b = w.T + (w.B - w.T) * (r + 1) / rows;
			ShowWindow((IntPtr)list[i], 9);
			SetWindowPos((IntPtr)list[i], IntPtr.Zero, l, t, rr - l, b - t, 0x44);
		}
		return null;
	}

	public static bool WaitTitle(long h, string before, int ms) {
		return Until(ms, () => Title(h) != before);
	}

	public static bool WaitFront(string[] wants, int ms) {
		return Until(ms, () => { var t = Title(Front()).ToLower(); foreach (var w in wants) if (t.Contains(w)) return true; return false; });
	}

	static bool Matches(Win w, string hint) {
		var app = w.app.ToLower(); var title = w.title.ToLower();
		return app == hint || app.Contains(hint) || (app.Length >= 3 && hint.Contains(app)) || title.Contains(hint);
	}

	public static long WaitNew(long[] before, string hint, int ms) {
		long found = 0;
		hint = hint.ToLower();
		var end = DateTime.Now.AddMilliseconds(ms);
		while (found == 0 && DateTime.Now < end) {
			foreach (var w in Windows()) if (Array.IndexOf(before, w.id) < 0 && Matches(w, hint)) { found = w.id; break; }
			if (found == 0) Thread.Sleep(100);
		}
		if (found == 0) foreach (var w in Windows(true)) if (Matches(w, hint)) { found = w.id; break; }
		return found != 0 && Focus(found) ? found : found == 0 ? 0 : -found;
	}

	public static string Guard(long h) {
		if (h == 0 || Front() == h) return null;
		if (!IsWindow((IntPtr)h)) return "The window it was working in has closed.";
		return Focus(h) ? null : "Another window is in front and the one it was working in would not come back, so nothing was typed.";
	}

	public static string TypeTo(long h, string text) {
		var e = Guard(h); if (e != null) return e;
		foreach (var ch in text) {
			if (h != 0 && Front() != h) return "Another window came to the front, so typing stopped.";
			Type(ch.ToString());
		}
		return null;
	}

	public static string PressTo(long h, string combo) {
		var e = Guard(h); if (e != null) return e;
		Press(combo);
		return null;
	}

	public static uint Idle() {
		var i = new LASTINPUT(); i.cb = (uint)Marshal.SizeOf(i);
		GetLastInputInfo(ref i);
		return (uint)Environment.TickCount - i.time;
	}

	static INPUT Key(ushort vk, bool up, uint extra = 0) {
		var i = new INPUT { type = 1 };
		i.u.ki = new KEYBDINPUT { vk = vk, flags = (up ? 2u : 0u) | extra };
		return i;
	}

	static void Send(INPUT[] list) { SendInput((uint)list.Length, list, Marshal.SizeOf(typeof(INPUT))); }

	static readonly Dictionary<string, ushort> VK = new Dictionary<string, ushort> {
		{"ctrl",0x11},{"control",0x11},{"alt",0x12},{"shift",0x10},{"win",0x5B},{"windows",0x5B},{"meta",0x5B},{"enter",0x0D},{"return",0x0D},{"esc",0x1B},{"escape",0x1B},
		{"tab",0x09},{"space",0x20},{"backspace",0x08},{"delete",0x2E},{"del",0x2E},{"insert",0x2D},{"home",0x24},{"end",0x23},{"up",0x26},{"down",0x28},
		{"left",0x25},{"right",0x27},{"pageup",0x21},{"pagedown",0x22},{"plus",0xBB},{"minus",0xBD}
	};

	static ushort Vk(string name) {
		ushort v;
		if (VK.TryGetValue(name, out v)) return v;
		if (name.Length > 1 && name[0] == 'f') { int n; if (int.TryParse(name.Substring(1), out n) && n >= 1 && n <= 24) return (ushort)(0x6F + n); }
		if (name.Length == 1) return (ushort)(VkKeyScan(name[0]) & 0xFF);
		throw new ArgumentException("Unknown key: " + name);
	}

	static bool Extended(ushort vk) { return (vk >= 0x21 && vk <= 0x28) || vk == 0x2D || vk == 0x2E || vk == 0x5B; }

	public static void Press(string combo) {
		var keys = new List<ushort>();
		foreach (var part in combo.ToLower().Split('+')) if (part.Trim() != "") keys.Add(Vk(part.Trim()));
		var list = new List<INPUT>();
		foreach (var k in keys) list.Add(Key(k, false, Extended(k) ? 1u : 0u));
		for (int i = keys.Count - 1; i >= 0; i--) list.Add(Key(keys[i], true, Extended(keys[i]) ? 1u : 0u));
		Send(list.ToArray());
		Thread.Sleep(60);
	}

	public static void Type(string text) {
		foreach (var ch in text.Replace("\r\n", "\n")) {
			if (ch == '\n') { Send(new[] { Key(0x0D, false), Key(0x0D, true) }); continue; }
			var down = new INPUT { type = 1 }; down.u.ki = new KEYBDINPUT { scan = ch, flags = 4 };
			var up = new INPUT { type = 1 }; up.u.ki = new KEYBDINPUT { scan = ch, flags = 6 };
			Send(new[] { down, up });
			Thread.Sleep(4);
		}
	}

	static INPUT Mouse(uint flags, int data = 0) { var i = new INPUT { type = 0 }; i.u.mi = new MOUSEINPUT { flags = flags, data = (uint)data }; return i; }

	public static void Click(int x, int y, string button, int count) {
		SetCursorPos(x, y);
		Thread.Sleep(40);
		uint d = button == "right" ? 8u : button == "middle" ? 0x20u : 2u;
		for (int i = 0; i < count; i++) { Send(new[] { Mouse(d), Mouse(d << 1) }); Thread.Sleep(60); }
	}

	public static void Scroll(int x, int y, int notches) {
		SetCursorPos(x, y);
		Send(new[] { Mouse(0x800, -notches * 120) });
	}

	public static int[] Screen() { return new[] { GetSystemMetrics(76), GetSystemMetrics(77), GetSystemMetrics(78), GetSystemMetrics(79) }; }
}
