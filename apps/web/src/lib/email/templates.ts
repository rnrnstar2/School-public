/**
 * Email templates for School notifications.
 * Plain HTML for maximum compatibility across email clients.
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://school.vercel.app'

function baseLayout(content: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:32px 16px">
<div style="background:#ffffff;border-radius:12px;padding:32px;border:1px solid #e2e8f0">
${content}
</div>
<p style="text-align:center;margin-top:24px;font-size:12px;color:#94a3b8">
  <a href="${SITE_URL}/settings" style="color:#94a3b8;text-decoration:underline">通知設定を変更</a>
  &nbsp;|&nbsp; School
</p>
</div>
</body>
</html>`
}

/**
 * ストリーク途切れリスクリマインダー（48時間未アクセス）
 */
export function streakReminderTemplate(params: {
  displayName: string
  streak: number
  hoursSinceAccess: number
}): { subject: string; html: string } {
  const { displayName, streak, hoursSinceAccess } = params
  const hoursLeft = Math.max(0, Math.round(72 - hoursSinceAccess))

  return {
    subject: `${displayName}さん、${streak}日のストリークを維持しましょう！`,
    html: baseLayout(`
      <h1 style="margin:0 0 16px;font-size:20px;color:#1e293b">
        学習ストリークが途切れそうです
      </h1>
      <p style="margin:0 0 12px;font-size:15px;color:#475569;line-height:1.6">
        ${displayName}さん、現在 <strong>${streak}日間</strong> 連続で学習を続けています。
        最後のアクセスから約 <strong>${Math.round(hoursSinceAccess)}時間</strong> が経過しました。
      </p>
      <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6">
        あと <strong>${hoursLeft}時間以内</strong> にアクセスすればストリークを維持できます。
        短い学習でもOK — 5分間だけでもストリークは維持されます！
      </p>
      <div style="text-align:center">
        <a href="${SITE_URL}/plan"
           style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">
          学習を再開する
        </a>
      </div>
    `),
  }
}

/**
 * マイルストーン達成祝福メール
 */
export function milestoneTemplate(params: {
  displayName: string
  milestoneTitle: string
}): { subject: string; html: string } {
  const { displayName, milestoneTitle } = params

  return {
    subject: `おめでとうございます！「${milestoneTitle}」を達成しました`,
    html: baseLayout(`
      <div style="text-align:center;margin-bottom:16px;font-size:40px">🎉</div>
      <h1 style="margin:0 0 16px;font-size:20px;color:#1e293b;text-align:center">
        マイルストーン達成！
      </h1>
      <p style="margin:0 0 12px;font-size:15px;color:#475569;line-height:1.6;text-align:center">
        ${displayName}さん、おめでとうございます！
      </p>
      <div style="background:#f0fdf4;border-radius:8px;padding:16px;margin:0 0 24px;text-align:center">
        <p style="margin:0;font-size:16px;font-weight:600;color:#15803d">
          「${milestoneTitle}」
        </p>
      </div>
      <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;text-align:center">
        この調子で次のステップに進みましょう！
      </p>
      <div style="text-align:center">
        <a href="${SITE_URL}/plan"
           style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">
          次のステップを確認
        </a>
      </div>
    `),
  }
}

/**
 * 卒業祝福メール
 */
export function graduationTemplate(params: {
  displayName: string
  trackTitle: string
}): { subject: string; html: string } {
  const { displayName, trackTitle } = params

  return {
    subject: `🎓 「${trackTitle}」を卒業しました！おめでとうございます`,
    html: baseLayout(`
      <div style="text-align:center;margin-bottom:16px;font-size:40px">🎓</div>
      <h1 style="margin:0 0 16px;font-size:20px;color:#1e293b;text-align:center">
        卒業おめでとうございます！
      </h1>
      <p style="margin:0 0 12px;font-size:15px;color:#475569;line-height:1.6;text-align:center">
        ${displayName}さん、「<strong>${trackTitle}</strong>」トラックを修了しました。
      </p>
      <div style="background:linear-gradient(135deg,#eff6ff,#f5f3ff);border-radius:8px;padding:20px;margin:0 0 24px;text-align:center">
        <p style="margin:0;font-size:16px;font-weight:600;color:#1e40af">
          すべてのレッスンとマイルストーンを完了！
        </p>
      </div>
      <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;text-align:center">
        卒業証明書をダウンロードしたり、次のトラックに挑戦しましょう。
      </p>
      <div style="text-align:center">
        <a href="${SITE_URL}/plan"
           style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">
          次のステップへ
        </a>
      </div>
    `),
  }
}
