'use client'

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from '@react-pdf/renderer'

/* ---------- Types ---------- */

export interface CertificateData {
  certificateId: string
  learnerName: string | null
  goalSummary: string
  planTitle: string | null
  trackName: string | null
  completedAt: string
  milestoneCount: number
  criteriaLabels: string[]
  artifactUrls: string[]
  aiToolsUsed: string[]
  verificationUrl: string
}

/* ---------- Font registration ---------- */

// Use built-in Helvetica (no external font needed)
Font.register({
  family: 'NotoSansJP',
  fonts: [
    {
      src: 'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-jp@5.0.1/files/noto-sans-jp-japanese-400-normal.woff',
      fontWeight: 400,
    },
    {
      src: 'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-jp@5.0.1/files/noto-sans-jp-japanese-700-normal.woff',
      fontWeight: 700,
    },
  ],
})

/* ---------- Styles ---------- */

const gold = '#b8860b'
const goldLight = '#fef3c7'
const darkText = '#1e293b'
const mutedText = '#64748b'

const styles = StyleSheet.create({
  page: {
    fontFamily: 'NotoSansJP',
    padding: 50,
    backgroundColor: '#fffef8',
  },
  border: {
    border: `2pt solid ${gold}`,
    padding: 40,
    minHeight: '100%',
  },
  header: {
    textAlign: 'center',
    marginBottom: 24,
  },
  titleEn: {
    fontSize: 22,
    fontWeight: 700,
    color: gold,
    letterSpacing: 4,
    marginBottom: 6,
  },
  titleJa: {
    fontSize: 14,
    color: gold,
    letterSpacing: 2,
    marginBottom: 16,
  },
  divider: {
    height: 2,
    backgroundColor: gold,
    marginVertical: 16,
    opacity: 0.4,
  },
  sectionTitle: {
    fontSize: 9,
    fontWeight: 700,
    color: mutedText,
    letterSpacing: 2,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  goalText: {
    fontSize: 14,
    fontWeight: 700,
    color: darkText,
    textAlign: 'center',
    marginBottom: 8,
  },
  learnerName: {
    fontSize: 18,
    fontWeight: 700,
    color: darkText,
    textAlign: 'center',
    marginBottom: 4,
  },
  planTitle: {
    fontSize: 10,
    color: mutedText,
    textAlign: 'center',
    marginBottom: 4,
  },
  dateText: {
    fontSize: 10,
    color: mutedText,
    textAlign: 'center',
    marginBottom: 20,
  },
  criteriaSection: {
    backgroundColor: goldLight,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  criteriaItem: {
    fontSize: 10,
    color: darkText,
    marginBottom: 4,
    paddingLeft: 8,
  },
  metaRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  metaCol: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 8,
    fontWeight: 700,
    color: mutedText,
    letterSpacing: 1,
    marginBottom: 3,
  },
  metaValue: {
    fontSize: 10,
    color: darkText,
  },
  artifactItem: {
    fontSize: 9,
    color: '#2563eb',
    marginBottom: 2,
    paddingLeft: 8,
  },
  footer: {
    marginTop: 'auto',
    paddingTop: 16,
    borderTop: `1pt solid ${gold}`,
    textAlign: 'center',
  },
  footerText: {
    fontSize: 8,
    color: mutedText,
    marginBottom: 2,
  },
  certId: {
    fontSize: 7,
    color: mutedText,
    fontFamily: 'Courier',
  },
})

/* ---------- Component ---------- */

export function CertificatePDF({ data }: { data: CertificateData }) {
  const dateStr = new Date(data.completedAt).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.border}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.titleEn}>CERTIFICATE OF COMPLETION</Text>
            <Text style={styles.titleJa}>卒業証明書</Text>
          </View>

          <View style={styles.divider} />

          {/* Learner name */}
          {data.learnerName && (
            <Text style={styles.learnerName}>{data.learnerName}</Text>
          )}

          {/* Goal */}
          <Text style={styles.goalText}>{data.goalSummary}</Text>

          {/* Plan & Track */}
          {data.planTitle && (
            <Text style={styles.planTitle}>プラン: {data.planTitle}</Text>
          )}
          {data.trackName && (
            <Text style={styles.planTitle}>トラック: {data.trackName}</Text>
          )}

          {/* Date */}
          <Text style={styles.dateText}>達成日: {dateStr}</Text>

          {/* Meta row */}
          <View style={styles.metaRow}>
            <View style={styles.metaCol}>
              <Text style={styles.metaLabel}>マイルストーン</Text>
              <Text style={styles.metaValue}>
                {data.milestoneCount} 完了
              </Text>
            </View>
            <View style={styles.metaCol}>
              <Text style={styles.metaLabel}>卒業基準</Text>
              <Text style={styles.metaValue}>
                {data.criteriaLabels.length} 達成
              </Text>
            </View>
            {data.aiToolsUsed.length > 0 && (
              <View style={styles.metaCol}>
                <Text style={styles.metaLabel}>使用AIツール</Text>
                <Text style={styles.metaValue}>
                  {data.aiToolsUsed.join(', ')}
                </Text>
              </View>
            )}
          </View>

          {/* Criteria */}
          <View style={styles.criteriaSection}>
            <Text style={styles.sectionTitle}>達成した卒業基準</Text>
            {data.criteriaLabels.map((label, i) => (
              <Text key={i} style={styles.criteriaItem}>
                ✓ {label}
              </Text>
            ))}
          </View>

          {/* Artifact URLs */}
          {data.artifactUrls.length > 0 && (
            <View style={{ marginBottom: 16 }}>
              <Text style={styles.sectionTitle}>成果物URL</Text>
              {data.artifactUrls.map((url, i) => (
                <Text key={i} style={styles.artifactItem}>
                  {url}
                </Text>
              ))}
            </View>
          )}

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Powered by School — AI を使う、次世代スクール
            </Text>
            <Text style={styles.footerText}>
              オンライン検証: {data.verificationUrl}
            </Text>
            <Text style={styles.certId}>
              Certificate ID: {data.certificateId}
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}
