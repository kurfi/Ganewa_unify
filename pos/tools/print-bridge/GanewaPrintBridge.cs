using System;
using System.Drawing.Printing;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace GanewaPrintBridge
{
    public class RawPrinterHelper
    {
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
        public class DOCINFOA
        {
            [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
            [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
            [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
        }

        [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

        [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        public static extern bool ClosePrinter(IntPtr hPrinter);

        [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

        [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        public static extern bool EndDocPrinter(IntPtr hPrinter);

        [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        public static extern bool StartPagePrinter(IntPtr hPrinter);

        [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        public static extern bool EndPagePrinter(IntPtr hPrinter);

        [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

        public static bool SendBytesToPrinter(string szPrinterName, byte[] bytes)
        {
            IntPtr hPrinter = new IntPtr(0);
            DOCINFOA di = new DOCINFOA();
            bool bSuccess = false;
            di.pDocName = "Ganewa Receipt";
            di.pDataType = "RAW";

            if (OpenPrinter(szPrinterName.Normalize(), out hPrinter, IntPtr.Zero))
            {
                if (StartDocPrinter(hPrinter, 1, di))
                {
                    if (StartPagePrinter(hPrinter))
                    {
                        IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
                        Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);
                        int dwWritten = 0;
                        bSuccess = WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out dwWritten);
                        Marshal.FreeCoTaskMem(pUnmanagedBytes);
                        EndPagePrinter(hPrinter);
                    }
                    EndDocPrinter(hPrinter);
                }
                ClosePrinter(hPrinter);
            }
            return bSuccess;
        }
    }

    class Program
    {
        private static string printerName = "Xprinter XP-80";
        private static int port = 9123;

        private static string ResolvePrinterName(string requested)
        {
            if (!string.IsNullOrEmpty(requested))
            {
                return requested;
            }

            try
            {
                // 1. Look for exact "Xprinter XP-80"
                foreach (string p in PrinterSettings.InstalledPrinters)
                {
                    if (string.Equals(p, "Xprinter XP-80", StringComparison.OrdinalIgnoreCase))
                        return p;
                }

                // 2. Look for keywords matching thermal/receipt printers
                string[] keywords = new string[] { "XP-80", "Xprinter", "POS-80", "POS 80", "Thermal", "Receipt", "XP-" };
                foreach (string kw in keywords)
                {
                    foreach (string p in PrinterSettings.InstalledPrinters)
                    {
                        if (p.IndexOf(kw, StringComparison.OrdinalIgnoreCase) >= 0)
                            return p;
                    }
                }

                // 3. Fallback to system default printer
                PrinterSettings ps = new PrinterSettings();
                if (!string.IsNullOrEmpty(ps.PrinterName))
                    return ps.PrinterName;
            }
            catch { }

            return "Xprinter XP-80";
        }

        static void Main(string[] args)
        {
            string specifiedPrinter = (args.Length > 0 && !string.IsNullOrEmpty(args[0])) ? args[0] : null;
            printerName = ResolvePrinterName(specifiedPrinter);

            HttpListener listener = new HttpListener();
            try { listener.Prefixes.Add(string.Format("http://127.0.0.1:{0}/", port)); } catch { }
            try { listener.Prefixes.Add(string.Format("http://localhost:{0}/", port)); } catch { }

            try
            {
                listener.Start();
            }
            catch (Exception ex)
            {
                File.AppendAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "bridge.log"), 
                    DateTime.Now.ToString("s") + " [ERROR] Failed to start listener: " + ex.Message + Environment.NewLine);
                return;
            }

            File.AppendAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "bridge.log"), 
                DateTime.Now.ToString("s") + " [INFO] Ganewa Print Bridge started for printer: " + printerName + Environment.NewLine);

            while (true)
            {
                try
                {
                    HttpListenerContext context = listener.GetContext();
                    ThreadPool.QueueUserWorkItem((c) => ProcessRequest((HttpListenerContext)c), context);
                }
                catch (Exception) { }
            }
        }

        private static void ProcessRequest(HttpListenerContext context)
        {
            HttpListenerRequest req = context.Request;
            HttpListenerResponse res = context.Response;

            res.Headers.Add("Access-Control-Allow-Origin", "*");
            res.Headers.Add("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
            res.Headers.Add("Access-Control-Allow-Headers", "*");
            res.Headers.Add("Access-Control-Allow-Private-Network", "true");

            if (req.HttpMethod == "OPTIONS")
            {
                res.StatusCode = 200;
                res.Close();
                return;
            }

            if (req.HttpMethod == "GET" && req.Url.AbsolutePath == "/status")
            {
                byte[] statusBuf = Encoding.UTF8.GetBytes("{\"status\":\"ok\",\"printer\":\"" + printerName + "\"}");
                res.ContentType = "application/json";
                res.OutputStream.Write(statusBuf, 0, statusBuf.Length);
                res.Close();
                return;
            }

            if (req.HttpMethod == "POST" && req.Url.AbsolutePath == "/print")
            {
                try
                {
                    byte[] buffer;
                    using (MemoryStream ms = new MemoryStream())
                    {
                        req.InputStream.CopyTo(ms);
                        buffer = ms.ToArray();
                    }

                    if (buffer.Length > 0)
                    {
                        bool success = RawPrinterHelper.SendBytesToPrinter(printerName, buffer);
                        string json = "{\"success\":" + (success ? "true" : "false") + "}";
                        byte[] respBuf = Encoding.UTF8.GetBytes(json);
                        res.ContentType = "application/json";
                        res.OutputStream.Write(respBuf, 0, respBuf.Length);
                    }
                    else
                    {
                        res.StatusCode = 400;
                    }
                }
                catch (Exception ex)
                {
                    res.StatusCode = 500;
                    byte[] errBuf = Encoding.UTF8.GetBytes("{\"error\":\"" + ex.Message + "\"}");
                    res.OutputStream.Write(errBuf, 0, errBuf.Length);
                }
                finally
                {
                    res.Close();
                }
                return;
            }

            res.StatusCode = 404;
            res.Close();
        }
    }
}
