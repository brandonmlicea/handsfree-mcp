using System;
using System.Collections.Generic;
using System.Drawing;
using System.Runtime.InteropServices;

[ComImport, Guid("92CA9DCD-5622-4BBA-A805-5E9F541BD8C9"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IObjectArray {
	[PreserveSig] int GetCount(out int count);
	[PreserveSig] int GetAt(int index, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out object item);
}

[ComImport, Guid("6D5140C1-7436-11CE-8034-00AA006009FA"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IServiceProvider10 {
	[PreserveSig] int QueryService(ref Guid service, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out object item);
}

[ComImport, Guid("372E1D3B-38D3-42E4-A15B-8AB2B178F513"), InterfaceType(ComInterfaceType.InterfaceIsIInspectable)]
interface IApplicationView { }

[ComImport, Guid("1841C6D7-4F9D-42C0-AF41-8747538F10E5"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IApplicationViewCollection {
	[PreserveSig] int GetViews(out IObjectArray views);
	[PreserveSig] int GetViewsByZOrder(out IObjectArray views);
	[PreserveSig] int GetViewsByAppUserModelId([MarshalAs(UnmanagedType.LPWStr)] string id, out IObjectArray views);
	[PreserveSig] int GetViewForHwnd(IntPtr hwnd, out IApplicationView view);
}

[ComImport, Guid("3F07F4BE-B107-441A-AF0F-39D82529072C"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IVirtualDesktop {
	[PreserveSig] int IsViewVisible(IApplicationView view, out int visible);
	[PreserveSig] int GetId(out Guid id);
	[PreserveSig] int GetName([MarshalAs(UnmanagedType.HString)] out string name);
}

[ComImport, Guid("53F5CA0B-158F-4124-900C-057158060B27"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IVirtualDesktopManagerInternal {
	[PreserveSig] int GetCount(out int count);
	[PreserveSig] int MoveViewToDesktop(IApplicationView view, IVirtualDesktop desktop);
	[PreserveSig] int CanViewMoveDesktops(IApplicationView view, out int can);
	[PreserveSig] int GetCurrentDesktop(out IVirtualDesktop desktop);
	[PreserveSig] int GetDesktops(out IObjectArray desktops);
	[PreserveSig] int GetAdjacentDesktop(IVirtualDesktop from, int direction, out IVirtualDesktop desktop);
	[PreserveSig] int SwitchDesktop(IVirtualDesktop desktop);
	[PreserveSig] int SwitchDesktopAndMoveForegroundView(IVirtualDesktop desktop);
	[PreserveSig] int CreateDesktop(out IVirtualDesktop desktop);
	[PreserveSig] int MoveDesktop(IVirtualDesktop desktop, int index);
	[PreserveSig] int RemoveDesktop(IVirtualDesktop desktop, IVirtualDesktop fallback);
	[PreserveSig] int FindDesktop(ref Guid id, out IVirtualDesktop desktop);
	[PreserveSig] int GetDesktopSwitchIncludeExcludeViews(IVirtualDesktop desktop, out IObjectArray one, out IObjectArray two);
	[PreserveSig] int SetDesktopName(IVirtualDesktop desktop, [MarshalAs(UnmanagedType.HString)] string name);
}

[ComImport, Guid("A5CD92FF-29BE-454C-8D04-D82879FB3F1B"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IVirtualDesktopManager {
	[PreserveSig] int IsWindowOnCurrentVirtualDesktop(IntPtr hwnd, out int on);
	[PreserveSig] int GetWindowDesktopId(IntPtr hwnd, out Guid id);
}

public static class Desk {
	public static string Name = "Claude Code";
	static Guid home = Guid.Empty;

	[DllImport("user32.dll")] static extern bool PrintWindow(IntPtr h, IntPtr dc, uint flags);
	[DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out Hf.RECT r);
	[DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr SendMessageW(IntPtr h, uint m, IntPtr w, string l);

	public class Info { public string id; public string name; public bool current; public bool agent; }

	static object Shell() { return Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("C2F03A33-21F5-47FA-B4BB-156362A2F239"))); }

	static T Service<T>(Guid service) {
		var iid = typeof(T).GUID;
		object item;
		int hr = ((IServiceProvider10)Shell()).QueryService(ref service, ref iid, out item);
		if (hr != 0) throw new InvalidOperationException("Virtual desktops need Windows 11 24H2 or newer (0x" + hr.ToString("X") + ").");
		return (T)item;
	}

	static IVirtualDesktopManagerInternal Manager() { return Service<IVirtualDesktopManagerInternal>(new Guid("C5E0CDCA-7B6E-41B2-9FC4-D93975CC467B")); }

	static IVirtualDesktopManager Public() { return (IVirtualDesktopManager)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("AA509086-5CA9-4C25-8F95-589D3C07B48A"))); }

	static void Check(int hr, string what) { if (hr != 0) throw new InvalidOperationException(what + " failed (0x" + hr.ToString("X") + ")."); }

	static Guid Id(IVirtualDesktop d) { Guid id; Check(d.GetId(out id), "Reading a desktop"); return id; }

	static string Label(IVirtualDesktop d) { string name; return d.GetName(out name) == 0 ? (name ?? "") : ""; }

	static List<IVirtualDesktop> All(IVirtualDesktopManagerInternal m) {
		IObjectArray array; Check(m.GetDesktops(out array), "Listing desktops");
		int count; array.GetCount(out count);
		var iid = typeof(IVirtualDesktop).GUID;
		var list = new List<IVirtualDesktop>();
		for (int i = 0; i < count; i++) { object item; if (array.GetAt(i, ref iid, out item) == 0) list.Add((IVirtualDesktop)item); }
		return list;
	}

	static IVirtualDesktop Current(IVirtualDesktopManagerInternal m) { IVirtualDesktop d; Check(m.GetCurrentDesktop(out d), "Reading the current desktop"); return d; }

	static IVirtualDesktop Agent(IVirtualDesktopManagerInternal m, bool create) {
		foreach (var d in All(m)) if (Label(d) == Name) return d;
		if (!create) return null;
		IVirtualDesktop made; Check(m.CreateDesktop(out made), "Creating the desktop");
		Check(m.SetDesktopName(made, Name), "Naming the desktop");
		return made;
	}

	public static List<Info> Desktops() {
		var m = Manager();
		var now = Id(Current(m));
		var list = new List<Info>();
		int at = 0;
		foreach (var d in All(m)) {
			at++;
			var name = Label(d);
			list.Add(new Info { id = Id(d).ToString(), name = name == "" ? "Desktop " + at : name, current = Id(d) == now, agent = name == Name });
		}
		return list;
	}

	public static string Ensure() { return Id(Agent(Manager(), true)).ToString(); }

	public static bool OnCurrent(long h) { int on; return Public().IsWindowOnCurrentVirtualDesktop((IntPtr)h, out on) != 0 || on != 0; }

	public static string Where(long h) {
		Guid id;
		if (Public().GetWindowDesktopId((IntPtr)h, out id) != 0 || id == Guid.Empty) return "";
		var m = Manager();
		if (id == Id(Current(m))) return "";
		IVirtualDesktop d;
		if (m.FindDesktop(ref id, out d) != 0) return "another desktop";
		var name = Label(d);
		return name == "" ? "another desktop" : name;
	}

	static void Move(IVirtualDesktopManagerInternal m, long h, IVirtualDesktop to) {
		var views = Service<IApplicationViewCollection>(typeof(IApplicationViewCollection).GUID);
		IApplicationView view;
		Check(views.GetViewForHwnd((IntPtr)h, out view), "Finding that window");
		Check(m.MoveViewToDesktop(view, to), "Moving that window");
	}

	public static void Send(long h) { var prev = Hf.Front(); var m = Manager(); Move(m, h, Agent(m, true)); Hf.Settle(h, prev); }

	[DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int w, int hh, uint f);

	public static long[] Borrow(long h) {
		var prev = Hf.Front();
		Hf.RECT r; GetWindowRect((IntPtr)h, out r);
		SetWindowPos((IntPtr)h, IntPtr.Zero, -32000, -32000, 0, 0, 0x15);
		Bring(h);
		var end = DateTime.Now.AddMilliseconds(1500);
		while (DateTime.Now < end) {
			try { if (System.Windows.Automation.TreeWalker.ControlViewWalker.GetFirstChild(System.Windows.Automation.AutomationElement.FromHandle((IntPtr)h)) != null) break; } catch { }
			System.Threading.Thread.Sleep(60);
		}
		return new long[] { r.L, r.T, prev };
	}

	public static void Return(long h, long[] keep) {
		var m = Manager();
		Move(m, h, Agent(m, true));
		SetWindowPos((IntPtr)h, IntPtr.Zero, (int)keep[0], (int)keep[1], 0, 0, 0x15);
		Hf.Settle(h, keep[2]);
	}

	public static void Bring(long h) { var m = Manager(); Move(m, h, Current(m)); }

	public static void Visit() {
		var m = Manager();
		var agent = Agent(m, true);
		var now = Current(m);
		if (Id(now) != Id(agent)) home = Id(now);
		Check(m.SwitchDesktop(agent), "Switching desktops");
	}

	public static void Leave() {
		var m = Manager();
		IVirtualDesktop back = null;
		if (home != Guid.Empty) { var id = home; m.FindDesktop(ref id, out back); }
		if (back == null) foreach (var d in All(m)) if (Label(d) != Name) { back = d; break; }
		if (back != null) Check(m.SwitchDesktop(back), "Switching desktops");
	}

	public static bool Remove() {
		var m = Manager();
		var agent = Agent(m, false);
		if (agent == null) return false;
		IVirtualDesktop back = null;
		foreach (var d in All(m)) if (Label(d) != Name) { back = d; break; }
		if (back == null) return false;
		Check(m.RemoveDesktop(agent, back), "Removing the desktop");
		return true;
	}

	public static Bitmap Capture(long h) {
		Hf.RECT r; GetWindowRect((IntPtr)h, out r);
		var bmp = new Bitmap(Math.Max(1, r.R - r.L), Math.Max(1, r.B - r.T));
		using (var g = Graphics.FromImage(bmp)) {
			var dc = g.GetHdc();
			PrintWindow((IntPtr)h, dc, 2);
			g.ReleaseHdc(dc);
		}
		return bmp;
	}

	public static void SetText(long h, string text) { SendMessageW((IntPtr)h, 0x000C, IntPtr.Zero, text); }

	public static void Insert(long h, string text) { SendMessageW((IntPtr)h, 0x00C2, (IntPtr)1, text); }
}
