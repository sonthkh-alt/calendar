import { useEffect, useRef, useState } from 'react';
import { MonitorSmartphone, Monitor, Smartphone, ChevronDown, Check } from 'lucide-react';

/**
 * Bộ chọn chế độ khung hình: Tự động (theo kích thước màn hình) / Máy tính / Điện thoại.
 * Lựa chọn được App lưu vào localStorage. Trên điện thoại, lịch tuần chuyển sang
 * chế độ Gọn (khối từng ngày, kéo dọc) cho dễ xem.
 * props: value ('auto'|'desktop'|'mobile'), onChange(value)
 */
const OPTIONS = [
  { value: 'auto', label: 'Tự động', Icon: MonitorSmartphone },
  { value: 'desktop', label: 'Máy tính', Icon: Monitor },
  { value: 'mobile', label: 'Điện thoại', Icon: Smartphone },
];

export default function DeviceSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const cur = OPTIONS.find((o) => o.value === value) || OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Chọn khung hình hiển thị"
        className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-[12px] font-semibold text-white transition"
      >
        <cur.Icon className="w-4 h-4 text-amber-200" />
        <span className="hidden md:inline">{cur.label}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-44 rounded-xl bg-white shadow-xl ring-1 ring-black/10 overflow-hidden z-50 py-1">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-left transition
                ${o.value === value ? 'bg-red-50 text-red-800 font-semibold' : 'text-slate-700 hover:bg-slate-50'}`}
            >
              <o.Icon className="w-4 h-4 shrink-0 text-slate-500" />
              <span className="flex-1">{o.label}</span>
              {o.value === value && <Check className="w-4 h-4 text-red-700" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
