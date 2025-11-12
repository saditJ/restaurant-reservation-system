'use client';

import { useEffect, useRef, useState } from 'react';

interface TimePickerProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  name?: string;
  required?: boolean;
  placeholder?: string;
  className?: string;
}

export function TimePicker({
  value,
  onChange,
  id,
  name,
  required,
  placeholder = 'HH:MM',
  className = '',
}: TimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen]);

  const handleTimeSelect = (time: string) => {
    onChange(time);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  // Generate time slots from 10:00 to 23:45 in 15-minute intervals
  const generateTimeSlots = () => {
    const slots: string[] = [];
    for (let hour = 10; hour <= 23; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        const h = String(hour).padStart(2, '0');
        const m = String(minute).padStart(2, '0');
        slots.push(`${h}:${m}`);
      }
    }
    return slots;
  };

  const timeSlots = generateTimeSlots();

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          name={name}
          type="text"
          inputMode="numeric"
          required={required}
          value={value}
          onChange={handleInputChange}
          onClick={() => setIsOpen(true)}
          placeholder={placeholder}
          className={`w-full cursor-pointer rounded-lg border px-3 py-2 pr-10 ${className}`}
          readOnly
        />
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-500 hover:bg-gray-100"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </button>
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 z-50 mt-2 max-h-96 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl">
          <div className="sticky top-0 bg-white px-3 py-2 text-sm font-semibold text-gray-700 border-b border-gray-200">
            Select Time
          </div>
          <div className="grid grid-cols-4 gap-2 p-3">
            {timeSlots.map((time) => (
              <button
                key={time}
                type="button"
                onClick={() => handleTimeSelect(time)}
                className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
                  value === time
                    ? 'bg-black text-white shadow-md'
                    : 'bg-gray-50 text-gray-700 hover:bg-gray-100 hover:shadow-sm'
                }`}
              >
                {time}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
