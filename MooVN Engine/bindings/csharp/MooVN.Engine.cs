// MooVN Engine — C# Polyglot SDK & Fast API Binding
// Supports both C# script DSL (`moovn.save:create(NAME)`) and native P/Invoke calls.

using System;
using System.Runtime.InteropServices;

namespace MooVN.Engine
{
    public static class NativeMethods
    {
        private const string LibName = "moovn_engine";

        [DllImport(LibName, CallingConvention = CallingConvention.Cdecl)]
        public static extern IntPtr moovn_engine_create();

        [DllImport(LibName, CallingConvention = CallingConvention.Cdecl)]
        public static extern void moovn_engine_destroy(IntPtr engine);

        [DllImport(LibName, CallingConvention = CallingConvention.Cdecl)]
        [return: MarshalAs(UnmanagedType.I1)]
        public static extern bool moovn_engine_save_create(
            IntPtr engine,
            [MarshalAs(UnmanagedType.LPUTF8Str)] string slotName
        );

        [DllImport(LibName, CallingConvention = CallingConvention.Cdecl)]
        [return: MarshalAs(UnmanagedType.I1)]
        public static extern bool moovn_engine_save_load(
            IntPtr engine,
            [MarshalAs(UnmanagedType.LPUTF8Str)] string slotName
        );

        [DllImport(LibName, CallingConvention = CallingConvention.Cdecl)]
        public static extern UIntPtr moovn_engine_eval_script(
            IntPtr engine,
            [MarshalAs(UnmanagedType.LPUTF8Str)] string langTag,
            [MarshalAs(UnmanagedType.LPUTF8Str)] string scriptSource
        );
    }

    /// <summary>
    /// Fast C# Visual Novel API (`moovn.save:create(NAME)` in MooVN Script or `moovn.save.create(NAME)` in C# host)
    /// </summary>
    public static class moovn
    {
        public static IntPtr Handle { get; set; } = IntPtr.Zero;

        public static class save
        {
            public static bool create(string name)
            {
                if (Handle == IntPtr.Zero) Handle = NativeMethods.moovn_engine_create();
                return NativeMethods.moovn_engine_save_create(Handle, name);
            }

            public static bool load(string name)
            {
                if (Handle == IntPtr.Zero) Handle = NativeMethods.moovn_engine_create();
                return NativeMethods.moovn_engine_save_load(Handle, name);
            }
        }

        public static int EvalScript(string csharpFastScript)
        {
            if (Handle == IntPtr.Zero) Handle = NativeMethods.moovn_engine_create();
            return (int)NativeMethods.moovn_engine_eval_script(Handle, "csharp", csharpFastScript);
        }
    }
}
