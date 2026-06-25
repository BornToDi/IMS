'use client'
import React, { useState } from 'react'

export default function MilestoneCard({
  milestone,
  onProgressChange,
  onSave,
  onDelete,
  onEdit,
  isEditing,
  draftTitle,
  onTitleChange,
  onUpdate,
  onCancel,
  saveState,
  manageState
}) {
  const progress = Math.min(Math.max(Number(milestone?.progress ?? 0), 0), 100)
  const isCompleted = progress >= 100
  const isInProgress = progress > 0 && progress < 100
  const isNotStarted = progress === 0

  const getStatusColor = () => {
    if (isCompleted) return 'text-emerald-600'
    if (isInProgress) return 'text-amber-600'
    return 'text-slate-600'
  }

  const getProgressBarColor = () => {
    if (isCompleted) return 'bg-emerald-500'
    if (isInProgress) return 'bg-amber-400'
    return 'bg-slate-300'
  }

  const getStatusBg = () => {
    if (isCompleted) return 'bg-emerald-50'
    if (isInProgress) return 'bg-amber-50'
    return 'bg-slate-50'
  }

  const getStatusLabel = () => {
    if (isCompleted) return 'Completed'
    if (isInProgress) return 'In Progress'
    return 'Not Started'
  }

  return (
    <div className={`rounded-xl border border-slate-200 ${getStatusBg()} p-4 transition-all hover:border-slate-300`}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input
              value={draftTitle ?? milestone?.title ?? ''}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="Milestone title"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-semibold focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
          ) : (
            <h3 className="text-sm font-semibold text-slate-900 truncate">{milestone?.title || 'Untitled'}</h3>
          )}
          <div className="mt-2 flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 text-xs font-medium ${getStatusColor()}`}>
              <span className={`w-2 h-2 rounded-full ${isCompleted ? 'bg-emerald-500' : isInProgress ? 'bg-amber-400' : 'bg-slate-400'}`} />
              {getStatusLabel()}
            </span>
            <span className="text-xs text-slate-500">•</span>
            <span className="text-xs font-semibold text-slate-700">{progress}%</span>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden">
          <div
            className={`h-full ${getProgressBarColor()} transition-all duration-300 ease-out`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Progress Slider */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-slate-600 mb-2">Update Progress</label>
        <input
          type="range"
          min="0"
          max="100"
          step="5"
          value={progress}
          onChange={(e) => onProgressChange(e.target.value)}
          className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
        />
        <div className="flex justify-between text-xs text-slate-500 mt-1">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        {isEditing ? (
          <>
            <button
              type="button"
              onClick={() => onUpdate(milestone.id)}
              disabled={manageState === 'saving'}
              className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {manageState === 'saving' ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 text-xs font-semibold bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onSave(milestone.id)}
              disabled={saveState === 'saving'}
              className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {saveState === 'saving' ? 'Saving...' : saveState === 'saved' ? '✓ Saved' : 'Save Progress'}
            </button>
            <button
              type="button"
              onClick={() => onEdit(milestone.id)}
              className="px-3 py-1.5 text-xs font-semibold bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => onDelete(milestone.id)}
              disabled={manageState === 'deleting'}
              className="px-3 py-1.5 text-xs font-semibold bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {manageState === 'deleting' ? 'Deleting...' : 'Delete'}
            </button>
          </>
        )}
        {saveState === 'error' && <span className="text-xs font-medium text-red-600">Save failed</span>}
        {manageState === 'saved' && <span className="text-xs font-medium text-emerald-600">✓ Updated</span>}
        {manageState === 'error' && <span className="text-xs font-medium text-red-600">Action failed</span>}
      </div>
    </div>
  )
}
