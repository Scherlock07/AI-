/**
 * 学情报告导出工具
 *
 * 方案：生成带 Word 命名空间的 HTML（MIME 类型 application/msword），
 * 浏览器下载后可直接用 Word/WPS 打开并继续编辑，无需后端依赖。
 * 同时支持新窗口打印为 PDF。
 */

/** 转义 HTML 特殊字符 */
function esc(v: any): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function today(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}年${p(d.getMonth() + 1)}月${p(d.getDate())}日`
}

/** 生成表格 HTML */
function tableHtml(headers: string[], rows: (string | number)[][]): string {
  const head = headers.map((h) => `<th>${esc(h)}</th>`).join('')
  const body = rows
    .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
    .join('')
  return `<table class="data"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
}

const STYLE = `
<style>
  @page { size: A4; margin: 2cm 1.8cm; }
  body { font-family: "SimSun", "宋体", serif; font-size: 10.5pt; line-height: 1.7; color: #1f2937; }
  h1 { font-family: "SimHei","黑体",sans-serif; font-size: 18pt; text-align: center; margin: 0 0 6pt; }
  .meta { text-align: center; font-size: 9pt; color: #6b7280; margin-bottom: 18pt; }
  h2 { font-family: "SimHei","黑体",sans-serif; font-size: 13pt; margin: 16pt 0 8pt;
       border-left: 4px solid #4f46e5; padding-left: 8pt; }
  h3 { font-family: "SimHei","黑体",sans-serif; font-size: 11pt; margin: 12pt 0 6pt; color: #374151; }
  p { margin: 0 0 8pt; text-indent: 2em; text-align: justify; }
  p.noindent { text-indent: 0; }
  table.data { width: 100%; border-collapse: collapse; margin: 8pt 0 12pt; font-size: 9.5pt; }
  table.data th { background: #eef2ff; border: 1px solid #c7d2fe; padding: 5pt 6pt;
                  font-family: "SimHei","黑体",sans-serif; text-align: left; }
  table.data td { border: 1px solid #d1d5db; padding: 5pt 6pt; }
  .kv { margin: 6pt 0 10pt; }
  .kv span { display: inline-block; margin-right: 18pt; font-size: 10pt; }
  .kv b { font-family: "SimHei","黑体",sans-serif; }
  ul { margin: 4pt 0 10pt 0; padding-left: 20pt; }
  li { margin-bottom: 4pt; }
  .tag { display: inline-block; padding: 1pt 6pt; border-radius: 3pt; font-size: 9pt;
         background: #f3f4f6; border: 1px solid #e5e7eb; margin-right: 4pt; }
  .footer { margin-top: 22pt; padding-top: 8pt; border-top: 1px solid #e5e7eb;
            font-size: 9pt; color: #9ca3af; text-align: center; }
</style>`

export interface ExportOptions {
  className: string
  days: number
  overview: any
  report: any
  focus?: string
}

/** 构建报告正文 HTML（导出与打印共用） */
export function buildReportHtml(opts: ExportOptions): string {
  const { className, days, overview, report, focus } = opts
  const ov = overview || {}
  const s = ov.summary || {}
  const rep = report || {}

  const parts: string[] = []

  parts.push(`<h1>${esc(className)} · 学情分析报告</h1>`)
  parts.push(
    `<div class="meta">统计周期：近 ${esc(days)} 天　|　生成时间：${esc(today())}` +
    (focus ? `　|　关注重点：${esc(focus)}` : '') + `</div>`
  )

  // 一、班级概览
  parts.push('<h2>一、班级概况</h2>')
  const ms = ov.module_scores || []
  const bands = ov.score_bands || []
  parts.push(
    `<div class="kv">` +
    `<span><b>班级人数</b>：${esc((ov.students || []).length)} 人</span>` +
    `<span><b>班级均分</b>：${esc(s.class_avg ?? 0)}</span>` +
    `<span><b>累计学习时长</b>：${esc(s.total_time ?? 0)} 分钟</span>` +
    `<span><b>累计练习次数</b>：${esc(s.total_exercises ?? 0)} 次</span>` +
    `<span><b>人均时长</b>：${esc(s.avg_time_per_student ?? 0)} 分钟</span>` +
    `</div>`
  )
  if (ms.length) {
    parts.push('<h3>各模块平均分</h3>')
    parts.push(tableHtml(
      ['模块', '平均分', '学习时长（分钟）'],
      ms.map((m: any) => [m.label || m.module, m.avg_score ?? 0, m.study_time ?? 0])
    ))
  }
  const bandsWithData = bands.filter((b: any) => (b.count || 0) > 0)
  if (bandsWithData.length) {
    parts.push('<h3>成绩分布</h3>')
    parts.push(tableHtml(
      ['分数段', '人数'],
      bandsWithData.map((b: any) => [b.band ?? b.range, b.count])
    ))
  }
  if ((ov.class_weak_modules || []).length) {
    parts.push(`<p>班级共性薄弱模块：${
      (ov.class_weak_modules || []).map((m: any) => `<span class="tag">${esc(m.label || m.module)}</span>`).join('')
    }</p>`)
  }

  // 二、总体诊断
  if (rep.overall_diagnosis) {
    parts.push('<h2>二、总体诊断</h2>')
    parts.push(`<p>${esc(rep.overall_diagnosis)}</p>`)
  }

  // 三、模块分析
  if ((rep.module_analysis || []).length) {
    parts.push('<h2>三、模块分析</h2>')
    parts.push(tableHtml(
      ['模块', '评价', '分析'],
      (rep.module_analysis || []).map((m: any) => [
        m.module || m.name || '',
        m.status || m.suggestion || m.action || '',
        m.analysis || m.comment || m.summary || '',
      ])
    ))
  }

  // 四、学生分层
  const lay = rep.student_layering || {}
  if (Object.keys(lay).length) {
    parts.push('<h2>四、学生分层</h2>')
    const layerMeta: [string, string][] = [
      ['attention', '需重点关注'],
      ['improving', '进步中'],
      ['excellent', '表现优秀'],
    ]
    for (const [key, label] of layerMeta) {
      const L = lay[key]
      if (!L) continue
      parts.push(`<h3>${esc(label)}</h3>`)
      if (L.summary) parts.push(`<p>${esc(L.summary)}</p>`)
      const names = L.students || []
      if (names.length) {
        parts.push(`<p class="noindent">名单：${
          names.map((n: any) => `<span class="tag">${esc(typeof n === 'string' ? n : (n.name || n.student_name || ''))}</span>`).join('')
        }</p>`)
      }
      if (L.actions) {
        const acts = Array.isArray(L.actions) ? L.actions : [L.actions]
        parts.push('<ul>' + acts.map((a: any) => `<li>${esc(a)}</li>`).join('') + '</ul>')
      }
    }
  }

  // 五、教学建议
  if ((rep.teaching_suggestions || []).length) {
    parts.push('<h2>五、教学建议</h2>')
    const prMap: Record<string, string> = {
      high: '高', medium: '中', low: '低', urgent: '紧急',
      高: '高', 中: '中', 低: '低',
      high_priority: '高', medium_priority: '中',
    }
    parts.push(tableHtml(
      ['#', '建议主题', '针对问题', '具体措施', '适用对象', '优先级'],
      (rep.teaching_suggestions || []).map((sg: any, i: number) => [
        i + 1, sg.title || '', sg.problem || '', sg.action || '', sg.target || '',
        prMap[sg.priority] || sg.priority || '',
      ])
    ))
  }

  // 六、跟进指标
  if ((rep.follow_up_metrics || []).length) {
    parts.push('<h2>六、跟进指标</h2>')
    parts.push('<ul>' + (rep.follow_up_metrics || []).map((m: any) => {
      const txt = typeof m === 'string' ? m : (m.metric || m.name || '') + (m.target ? `：目标 ${m.target}` : '')
      return `<li>${esc(txt)}</li>`
    }).join('') + '</ul>')
  }

  // 七、数据说明
  const notes = rep.data_notes
  if (notes && (Array.isArray(notes) ? notes.length : true)) {
    parts.push('<h2>七、数据说明</h2>')
    if (Array.isArray(notes)) {
      parts.push('<ul>' + notes.map((n: string) => `<li>${esc(n)}</li>`).join('') + '</ul>')
    } else {
      parts.push(`<p>${esc(notes)}</p>`)
    }
  }

  parts.push(`<div class="footer">本报告由 AI 外语学习平台自动生成 · 统计周期近 ${esc(days)} 天<br/>报告中所有指标均源自学生真实练习记录</div>`)

  return parts.join('\n')
}

/** 下载为 Word 文档（.doc，Word/WPS 可直接打开编辑） */
export function exportReportAsWord(opts: ExportOptions) {
  const body = buildReportHtml(opts)
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${esc(opts.className)} 学情分析报告</title>${STYLE}</head>
<body>${body}</body></html>`

  const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  a.href = url
  a.download = `${opts.className}_学情分析报告_${stamp}.doc`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}

/** 新窗口打印（可另存为 PDF） */
export function printReport(opts: ExportOptions) {
  const body = buildReportHtml(opts)
  const html = `<html><head><meta charset="utf-8">
    <title>${esc(opts.className)} 学情分析报告</title>${STYLE}</head><body>${body}</body></html>`
  const w = window.open('', '_blank', 'width=900,height=1000')
  if (!w) return false
  w.document.write(html)
  w.document.close()
  setTimeout(() => { w.focus(); w.print() }, 400)
  return true
}
