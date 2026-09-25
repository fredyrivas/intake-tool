import { useState } from 'react';
import { brandExceptionNotes, coreBrands } from '../shared/brief-contract';

export function BrandChoices({
  value,
  onChange,
  disabled = false,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}) {
  const [additionalBrand, setAdditionalBrand] = useState('');
  const exceptions = value.filter(
    (brand) => !coreBrands.some((core) => core.toLowerCase() === brand.toLowerCase()),
  );

  function addBrand() {
    const brand = additionalBrand.trim();
    if (!brand || brand.length > 80 || value.length >= 40) return;
    if (!value.some((selected) => selected.toLowerCase() === brand.toLowerCase())) {
      onChange([...value, brand]);
    }
    setAdditionalBrand('');
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {coreBrands.map((brand) => (
          <label
            key={brand}
            className="flex min-w-0 cursor-pointer items-center gap-2 rounded-xl border border-black/10 bg-white p-3 text-sm"
          >
            <input
              type="checkbox"
              disabled={disabled}
              checked={value.includes(brand)}
              onChange={() =>
                onChange(
                  value.includes(brand)
                    ? value.filter((selected) => selected !== brand)
                    : [...value, brand],
                )
              }
              className="accent-[#7b3fc4]"
            />
            {brand}
          </label>
        ))}
      </div>
      {exceptions.map((brand) => (
        <div
          key={brand}
          className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm"
        >
          <span>{brand}</span>
          {!disabled ? (
            <button
              type="button"
              onClick={() => onChange(value.filter((selected) => selected !== brand))}
              className="text-xs font-semibold text-amber-800"
            >
              Remove
            </button>
          ) : null}
        </div>
      ))}
      {!disabled ? (
        <div className="flex gap-2">
          <input
            aria-label="Additional brand"
            placeholder="Additional brand"
            value={additionalBrand}
            maxLength={80}
            onChange={(event) => setAdditionalBrand(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addBrand();
              }
            }}
            className="h-11 min-w-0 flex-1 rounded-xl border border-black/15 bg-white px-3 text-sm outline-none focus:border-[#8e54d7]"
          />
          <button
            type="button"
            onClick={addBrand}
            disabled={!additionalBrand.trim() || value.length >= 40}
            className="rounded-xl border border-black/15 px-3 text-sm font-medium disabled:opacity-40"
          >
            Add
          </button>
        </div>
      ) : null}
      {brandExceptionNotes(value).map((note) => (
        <p key={note} className="text-xs leading-5 text-amber-800">
          {note}
        </p>
      ))}
    </div>
  );
}
