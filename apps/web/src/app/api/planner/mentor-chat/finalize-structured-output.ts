import { parseMentorActions, stripMentorActionTags } from '@/lib/mentor/parse-mentor-actions'
import type { MentorChatStructuredOutput } from '@/types/mentor-chat'

export function finalizePlannerMentorStructuredOutput(
  structuredOutput: MentorChatStructuredOutput,
) {
  const parsedReply = parseMentorActions(structuredOutput.reply)

  return {
    detectedActions: parsedReply.actions,
    finalStructuredOutput: {
      ...structuredOutput,
      reply: stripMentorActionTags(parsedReply.cleanText || structuredOutput.reply),
    },
  }
}
