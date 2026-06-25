"use client"

import React, { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import 'react-quill/dist/quill.snow.css'

const ReactQuill = dynamic(() => import('react-quill'), { ssr: false })

export default function AnnouncementEditor({ initialContent = '', onChange }) {
  const [value, setValue] = useState(initialContent)

  useEffect(() => {
    setValue(initialContent)
  }, [initialContent])

  function handleChange(content) {
    setValue(content)
    onChange?.(content)
  }

  return (
    <div className="announcement-editor">
      <ReactQuill value={value} onChange={handleChange} theme="snow" />
    </div>
  )
}
