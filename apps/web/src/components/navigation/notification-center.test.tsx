import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Mock the useNotifications hook
const mockMarkRead = vi.fn()
const mockMarkAllRead = vi.fn()
let mockNotifications: Array<{
  id: string
  type: string
  title: string
  body: string
  read: boolean
  link: string | null
  created_at: string
}> = []
let mockUnreadCount = 0
let mockLoading = false

vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => ({
    notifications: mockNotifications,
    unreadCount: mockUnreadCount,
    loading: mockLoading,
    markRead: mockMarkRead,
    markAllRead: mockMarkAllRead,
    refresh: vi.fn(),
  }),
}))

import NotificationCenter from './notification-center'

beforeEach(() => {
  mockNotifications = []
  mockUnreadCount = 0
  mockLoading = false
  mockMarkRead.mockClear()
  mockMarkAllRead.mockClear()
})

describe('NotificationCenter', () => {
  it('renders bell button', () => {
    render(<NotificationCenter />)
    expect(screen.getByLabelText('通知')).toBeInTheDocument()
  })

  it('shows unread badge when notifications exist', () => {
    mockUnreadCount = 3
    mockNotifications = [
      { id: '1', type: 'milestone_reached', title: 'テスト通知', body: '', read: false, link: null, created_at: new Date().toISOString() },
    ]

    render(<NotificationCenter />)
    expect(screen.getByLabelText('通知（3件未読）')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('caps badge at 99+', () => {
    mockUnreadCount = 150

    render(<NotificationCenter />)
    expect(screen.getByText('99+')).toBeInTheDocument()
  })

  it('opens panel on bell click', async () => {
    mockNotifications = [
      { id: '1', type: 'milestone_reached', title: 'マイルストーン達成！', body: '説明テキスト', read: false, link: null, created_at: new Date().toISOString() },
    ]
    mockUnreadCount = 1

    render(<NotificationCenter />)
    fireEvent.click(screen.getByLabelText('通知（1件未読）'))

    await waitFor(() => {
      expect(screen.getByRole('region', { name: '通知センター' })).toBeInTheDocument()
    })
    expect(screen.getByText('マイルストーン達成！')).toBeInTheDocument()
  })

  it('shows empty state when no notifications', async () => {
    mockNotifications = []
    mockLoading = false

    render(<NotificationCenter />)
    fireEvent.click(screen.getByLabelText('通知'))

    await waitFor(() => {
      expect(screen.getByText('通知はありません')).toBeInTheDocument()
    })
  })

  it('shows loading state', async () => {
    mockLoading = true

    render(<NotificationCenter />)
    fireEvent.click(screen.getByLabelText('通知'))

    await waitFor(() => {
      expect(screen.getByText('読み込み中...')).toBeInTheDocument()
    })
  })

  it('shows mark all read button when unread exists', async () => {
    mockUnreadCount = 2
    mockNotifications = [
      { id: '1', type: 'streak_update', title: 'ストリーク更新', body: '', read: false, link: null, created_at: new Date().toISOString() },
    ]

    render(<NotificationCenter />)
    fireEvent.click(screen.getByLabelText('通知（2件未読）'))

    await waitFor(() => {
      expect(screen.getByText('すべて既読')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('すべて既読'))
    expect(mockMarkAllRead).toHaveBeenCalledOnce()
  })

  it('calls markRead when clicking unread notification', async () => {
    mockNotifications = [
      { id: 'n1', type: 'lesson_recommendation', title: '次のレッスン', body: '', read: false, link: '/lessons/web-002', created_at: new Date().toISOString() },
    ]
    mockUnreadCount = 1

    render(<NotificationCenter />)
    fireEvent.click(screen.getByLabelText('通知（1件未読）'))

    await waitFor(() => {
      expect(screen.getByText('次のレッスン')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('次のレッスン'))
    expect(mockMarkRead).toHaveBeenCalledWith('n1')
  })

  it('renders notification types with correct labels', async () => {
    mockNotifications = [
      { id: '1', type: 'milestone_reached', title: 'M1', body: '', read: true, link: null, created_at: new Date().toISOString() },
      { id: '2', type: 'streak_update', title: 'S1', body: '', read: true, link: null, created_at: new Date().toISOString() },
      { id: '3', type: 'artifact_verified', title: 'A1', body: '', read: true, link: null, created_at: new Date().toISOString() },
    ]

    render(<NotificationCenter />)
    fireEvent.click(screen.getByLabelText('通知'))

    await waitFor(() => {
      expect(screen.getByText('M1')).toBeInTheDocument()
      expect(screen.getByText('S1')).toBeInTheDocument()
      expect(screen.getByText('A1')).toBeInTheDocument()
    })
  })

  it('has correct aria attributes', () => {
    render(<NotificationCenter />)
    const button = screen.getByLabelText('通知')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button).toHaveAttribute('aria-haspopup', 'true')
  })

  it('closes on Escape key', async () => {
    mockNotifications = [
      { id: '1', type: 'milestone_reached', title: 'テスト', body: '', read: false, link: null, created_at: new Date().toISOString() },
    ]
    mockUnreadCount = 1

    render(<NotificationCenter />)
    fireEvent.click(screen.getByLabelText('通知（1件未読）'))

    await waitFor(() => {
      expect(screen.getByRole('region', { name: '通知センター' })).toBeInTheDocument()
    })

    fireEvent.keyDown(screen.getByLabelText('通知（1件未読）'), { key: 'Escape' })
    // Panel should close (button aria-expanded should be false)
    expect(screen.getByLabelText('通知（1件未読）')).toHaveAttribute('aria-expanded', 'false')
  })
})
