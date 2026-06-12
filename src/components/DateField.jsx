import { useEffect, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { isoToDMY, dmyToISO } from '../lib/dates';

/**
 * Ô nhập NGÀY định dạng ngày/tháng/năm (dd/mm/yyyy) — thay <input type="date">
 * để KHÔNG phụ thuộc locale trình duyệt (vốn có thể hiện mm/dd/yyyy kiểu Mỹ).
 * Vẫn có nút lịch mở bộ chọn ngày của hệ thống.
 * props: value (ISO 'yyyy-mm-dd'), onChange(iso), className, required
 */
export default function DateField({ value, onChange, className = '', required }) {
  const [text, setText] = useState(isoToDMY(value));
  useEffect(() => { setText(isoToDMY(value)); }, [value]);
  const pickerRef = useRef(null);

  const commit = (t) => {
    const iso = dmyToISO(t);
    if (iso) { onChange?.(iso); setText(isoToDMY(iso)); }
    else setText(isoToDMY(value)); // nhập sai -> khôi phục giá trị cũ
  };

  const openPicker = () => {
    const p = pickerRef.current;
    if (!p) return;
    if (typeof p.showPicker === 'function') p.showPicker();
    else p.focus();
  };

  return (
    <div className="relative">
      <input
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/yyyy"
        value={text}
        required={required}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(e.currentTarget.value); } }}
        className={`w-full ${className} pr-9`}
      />
      <button
        type="button"
        onClick={openPicker}
        tabIndex={-1}
        title="Chọn ngày trên lịch"
        className="absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-400 hover:text-red-600"
      >
        <CalendarDays className="w-4 h-4" />
      </button>
      {/* Bộ chọn ngày của hệ thống (ẩn) — chỉ dùng để mở lịch qua nút trên */}
      <input
        ref={pickerRef}
        type="date"
        value={value || ''}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => { if (e.target.value) onChange?.(e.target.value); }}
        className="absolute right-0 bottom-0 w-px h-px opacity-0 pointer-events-none"
      />
    </div>
  );
}
