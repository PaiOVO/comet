import { Loader2, Send, UserSearch, X } from 'lucide-react'
import { useCallback, useState } from 'react'

import type { BilibiliUserCard, BilibiliSession } from '@/types/bilibili'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'

import { toastManager } from '@/components/ui/toast'

interface NewConversationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after message is sent successfully with the target session info */
  onSessionNavigate: (session: BilibiliSession) => void
  /** Current user's mid for constructing optimistic session */
  currentUserMid?: number
}

export function NewConversationDialog({
  open,
  onOpenChange,
  onSessionNavigate,
  currentUserMid,
}: NewConversationDialogProps) {
  const [uid, setUid] = useState('')
  const [message, setMessage] = useState('')
  const [looking, setLooking] = useState(false)
  const [sending, setSending] = useState(false)
  const [targetUser, setTargetUser] = useState<BilibiliUserCard | null>(null)
  const [lookupError, setLookupError] = useState<string | null>(null)

  const resetState = useCallback(() => {
    setUid('')
    setMessage('')
    setTargetUser(null)
    setLookupError(null)
  }, [])

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        resetState()
      }
      onOpenChange(isOpen)
    },
    [onOpenChange, resetState]
  )

  const handleLookup = useCallback(async () => {
    const trimmed = uid.trim()
    if (!trimmed || !/^\d+$/.test(trimmed)) {
      setLookupError('请输入有效的 UID（纯数字）')
      return
    }

    setLooking(true)
    setLookupError(null)
    setTargetUser(null)

    try {
      const data = await window.electronAPI.bilibili.fetchUsers({ uids: trimmed })

      if ('error' in data) {
        setLookupError(data.error || '查询用户失败')
        return
      }

      if (data.code !== 0) {
        setLookupError(data.message || '查询用户失败')
        return
      }

      const users = data.data
      if (!users || users.length === 0) {
        setLookupError('未找到该用户')
        return
      }

      setTargetUser(users[0])
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : '网络错误')
    } finally {
      setLooking(false)
    }
  }, [uid])

  const handleSend = useCallback(async () => {
    if (!targetUser || !message.trim()) return

    setSending(true)

    try {
      const msgContent = JSON.stringify({ content: message.trim() })

      const data = await window.electronAPI.bilibili.sendMessage({
        receiverId: String(targetUser.mid),
        receiverType: '1', // User session
        msgType: '1', // Text message
        content: msgContent,
      })

      if ('error' in data) {
        toastManager.add({
          type: 'error',
          title: '发送失败',
          description: data.error || '无法发送消息',
        })
        return
      }

      if (data.code !== 0) {
        toastManager.add({
          type: 'error',
          title: '发送失败',
          description: data.message || '无法发送消息',
        })
        return
      }

      toastManager.add({
        type: 'success',
        title: '发送成功',
        description: `已向 ${targetUser.name} 发送私信`,
      })

      // Construct a minimal session object so the parent can navigate to it
      const now = Math.floor(Date.now() / 1000)
      const syntheticSession: BilibiliSession = {
        talker_id: targetUser.mid,
        session_type: 1,
        at_seqno: 0,
        top_ts: 0,
        group_name: '',
        group_cover: '',
        is_follow: 0,
        is_dnd: 0,
        ack_seqno: 0,
        ack_ts: 0,
        session_ts: now * 1000, // microsecond
        unread_count: 0,
        last_msg: {
          sender_uid: currentUserMid ?? 0,
          receiver_type: 1,
          receiver_id: targetUser.mid,
          msg_type: 1,
          content: msgContent,
          msg_seqno: 0,
          timestamp: now,
          at_uids: null,
          msg_key: String(data.data?.msg_key ?? ''),
          msg_status: 0,
          notify_code: '',
          new_face_version: 1,
          msg_source: 7,
        },
        group_type: 0,
        can_fold: 0,
        status: 0,
        max_seqno: 0,
        new_push_msg: 0,
        setting: 0,
        is_guardian: 0,
        is_intercept: 0,
        is_trust: 0,
        system_msg_type: 0,
        live_status: 0,
        biz_msg_unread_count: 0,
        user_label: null,
        account_info: {
          name: targetUser.name,
          pic_url: targetUser.face,
        },
      }

      handleOpenChange(false)
      onSessionNavigate(syntheticSession)
    } catch (err) {
      toastManager.add({
        type: 'error',
        title: '发送失败',
        description: err instanceof Error ? err.message : '网络错误',
      })
    } finally {
      setSending(false)
    }
  }, [targetUser, message, currentUserMid, onSessionNavigate, handleOpenChange])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>发起新私信</DialogTitle>
          <DialogDescription>输入对方的 UID，即可向从未私信过的用户发送消息</DialogDescription>
        </DialogHeader>

        <div className='flex flex-col gap-4 px-6'>
          {/* UID input + lookup */}
          <Field>
            <FieldLabel>对方 UID</FieldLabel>
            <div className='flex gap-2'>
              <Input
                placeholder='例如：123456789'
                value={uid}
                onChange={e => {
                  setUid(e.target.value)
                  setTargetUser(null)
                  setLookupError(null)
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !targetUser) {
                    e.preventDefault()
                    handleLookup()
                  }
                }}
                disabled={looking || sending}
              />
              <Button
                variant='outline'
                size='icon'
                onClick={handleLookup}
                disabled={looking || sending || !uid.trim()}
                aria-label='查询用户'
              >
                {looking ? <Spinner className='size-4' /> : <UserSearch className='size-4' />}
              </Button>
            </div>
            {lookupError && <p className='text-destructive-foreground text-xs'>{lookupError}</p>}
          </Field>

          {/* Target user preview */}
          {targetUser && (
            <div className='flex items-center gap-3 rounded-lg border bg-muted/50 p-3'>
              <Avatar className='size-10'>
                <AvatarImage src={targetUser.face} alt={targetUser.name} />
                <AvatarFallback>{targetUser.name.slice(0, 1)}</AvatarFallback>
              </Avatar>
              <div className='min-w-0 flex-1'>
                <p className='truncate font-medium text-sm'>{targetUser.name}</p>
                <p className='truncate text-muted-foreground text-xs'>UID: {targetUser.mid}</p>
              </div>
              <Button
                variant='ghost'
                size='icon-xs'
                onClick={() => {
                  setTargetUser(null)
                  setMessage('')
                }}
                aria-label='清除选择'
              >
                <X className='size-3.5' />
              </Button>
            </div>
          )}

          {/* Message input */}
          {targetUser && (
            <Field>
              <FieldLabel>消息内容</FieldLabel>
              <Textarea
                placeholder='输入要发送的消息…'
                value={message}
                onChange={e => setMessage(e.target.value)}
                autoFocus
                onKeyDown={e => {
                  // Ctrl/Cmd + Enter to send
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                disabled={sending}
              />
              <p className='text-muted-foreground text-xs'>按 Ctrl+Enter 发送</p>
            </Field>
          )}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant='outline' />}>取消</DialogClose>
          {targetUser && (
            <Button onClick={handleSend} disabled={!message.trim() || sending}>
              {sending ? <Loader2 className='size-4 animate-spin' /> : <Send className='size-4' />}
              {sending ? '发送中…' : '发送'}
            </Button>
          )}
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  )
}
