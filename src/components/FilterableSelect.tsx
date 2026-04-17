import { useState, useRef, useEffect } from 'react'
import './FilterableSelect.css'

interface FilterableSelectProps {
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export default function FilterableSelect({ value, options, onChange, placeholder, className }: FilterableSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 外部クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setFilter('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // フィルタリング
  const filteredOptions = options.filter(opt =>
    opt.label.toLowerCase().includes(filter.toLowerCase())
  )

  // キーボード操作
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        setIsOpen(true)
        e.preventDefault()
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightIndex(prev => Math.min(prev + 1, filteredOptions.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightIndex(prev => Math.max(prev - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (filteredOptions[highlightIndex]) {
          onChange(filteredOptions[highlightIndex].value)
          setIsOpen(false)
          setFilter('')
        }
        break
      case 'Escape':
        setIsOpen(false)
        setFilter('')
        break
    }
  }

  const handleSelect = (optionValue: string) => {
    onChange(optionValue)
    setIsOpen(false)
    setFilter('')
  }

  const displayValue = options.find(opt => opt.value === value)?.label || ''

  return (
    <div className={`filterable-select ${className || ''}`} ref={containerRef}>
      <input
        ref={inputRef}
        type="text"
        className="filterable-select-input"
        value={isOpen ? filter : displayValue}
        onChange={(e) => {
          setFilter(e.target.value)
          setHighlightIndex(0)
          if (!isOpen) setIsOpen(true)
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
      />
      {isOpen && filteredOptions.length > 0 && (
        <ul className="filterable-select-options">
          {filteredOptions.map((option, index) => (
            <li
              key={option.value}
              className={`filterable-select-option ${index === highlightIndex ? 'highlighted' : ''} ${option.value === value ? 'selected' : ''}`}
              onClick={() => handleSelect(option.value)}
              onMouseEnter={() => setHighlightIndex(index)}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
      {isOpen && filteredOptions.length === 0 && filter && (
        <ul className="filterable-select-options">
          <li className="filterable-select-option no-results">該当なし</li>
        </ul>
      )}
    </div>
  )
}
