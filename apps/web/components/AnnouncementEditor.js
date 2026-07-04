"use client"

import React, { useState, useEffect } from 'react'
import { htmlToPlainText } from '../lib/plainText'

export default function AnnouncementEditor({ initialContent = '', onChange }) {
  const [value, setValue] = useState(() => htmlToPlainText(initialContent))

  useEffect(() => {
    setValue(htmlToPlainText(initialContent))
  }, [initialContent])

  function handleChange(content) {
    setValue(content)
    onChange?.(content)
  }

  return (
    <textarea
      value={value}
      onChange={(event) => handleChange(event.target.value)}
      className="input min-h-36 resize-y"
      placeholder="Write the announcement..."
    />
  )
}
