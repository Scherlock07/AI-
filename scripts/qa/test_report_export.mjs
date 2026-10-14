import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { buildReportHtml } = require('./re.cjs')

const overview = {
  class_name: '26学生会测试',
  student_count: 5,
  active_student_count: 4,
  summary: { total_time: 2672, total_exercises: 232, class_avg: 75.6, avg_time_per_student: 534, assignment_count: 2 },
  module_scores: [
    { module: 'listening', label: '听力', avg_score: 78.2, study_time: 620, exercise_count: 40 },
    { module: 'speaking', label: '口语', avg_score: 0, study_time: 480, exercise_count: 30 },
  ],
  class_weak_modules: [{ module: 'speaking', label: '口语', avg_score: 66.5 }],
  score_bands: [{ band: '90-100', count: 1 }, { band: '无数据', count: 0 }],
  students: [{}, {}, {}, {}, {}],
}
const report = {
  overall_diagnosis: '本班整体表现中等偏上，均分 75.6。',
  module_analysis: [
    { module: '听力', status: '良好', analysis: '均分 78.2，高于班级均分。' },
  ],
  student_layering: {
    attention: { summary: '基础薄弱', students: ['张三', '李四'], actions: '建议每日 20 分钟基础训练' },
    improving: { summary: '稳步提升', students: ['王五'], actions: '保持当前节奏' },
    excellent: { summary: '表现优异', students: ['赵六'], actions: '可尝试进阶材料' },
  },
  teaching_suggestions: [
    { title: '强化口语输出', problem: '口语均分 66.5 低于班级均分', action: '每周安排 2 次配对对话', target: '全体', priority: '高' },
  ],
  follow_up_metrics: ['口语平均分', '周练习时长'],
  data_notes: ['口语模块样本量较少，结论仅供参考'],
}

const html = buildReportHtml({ className: '26学生会测试', days: 30, overview, report, focus: '口语' })

const checks = {
  '标题含班名': html.includes('26学生会测试'),
  '班级均分 75.6': html.includes('75.6'),
  '总时长 2672': html.includes('2672'),
  '模块表含听力/口语': html.includes('听力') && html.includes('口语'),
  '分数段用 band 字段(90-100)': html.includes('90-100'),
  '空数据段被过滤(无"无数据"行)': !html.includes('<td>无数据</td>'),
  '薄弱模块标签': html.includes('口语'),
  '总体诊断': html.includes('本班整体表现中等偏上'),
  '模块分析含状态"良好"': html.includes('良好'),
  '分层-重点关注': html.includes('需重点关注') && html.includes('张三'),
  '分层-进步中': html.includes('进步中') && html.includes('王五'),
  '分层-表现优秀': html.includes('表现优秀') && html.includes('赵六'),
  'actions 字符串被渲染为 li': html.includes('每日 20 分钟基础训练'),
  '教学建议标题': html.includes('强化口语输出'),
  '优先级"高"原样显示': html.includes('<td>高</td>'),
  '跟进指标': html.includes('口语平均分'),
  '数据说明': html.includes('样本量较少'),
  '关注重点=口语': html.includes('关注重点：口语'),
  '无 undefined': !html.includes('undefined'),
  '无 null': !html.includes('>null<'),
  '无 [object Object]': !html.includes('[object Object]'),
}
let pass = 0, fail = []
for (const [k, v] of Object.entries(checks)) { if (v) pass++; else fail.push(k) }
console.log(`通过 ${pass}/${Object.keys(checks).length}`)
if (fail.length) { console.log('失败项:'); fail.forEach(f => console.log('  ✗ ' + f)); process.exit(1) }
console.log('=== reportExport 字段映射全部正确 ===')
