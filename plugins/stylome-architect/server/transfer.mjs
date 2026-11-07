// stylomeArchitect 迁移参考（输出 B）：在档案库全部作者（除锚定）的信号空间里，
// 按侧面检索与输入作品最相似的样本，回放其信号曲线，给出"像哪篇、哪方面像、可参考什么"。
//
// 方法定位：案例式迁移（case-based transfer）——零模型纪律下不训练跨作者模型，
// 用"标准化信号子空间近邻检索 + 信号回放 + 方向性映射"实现迁移学习的最简可行形态；
// 样本量与可解释性理由见 THEORY.md §四（S 队列）。

const r4 = (v) => (Number.isFinite(v) ? Math.round(v * 10000) / 10000 : null)
const mean = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length)
const sdOf = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)) || 1e-9 }

const cosine = (a, b) => {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return dot / (Math.sqrt(na * nb) || 1e-9)
}
const zArc = (a) => { if (!a?.some((v) => v != null)) return null; const m = mean(a), s = sdOf(a); return a.map((v) => (v == null ? 0 : (v - m) / s)) }

/** 信号侧面：id / 标签 / 距离函数（越小越像）/ 建议模板。 */
export const ASPECTS = [
  {
    id: 'emotion-density', label: '情绪显影浓度',
    dist: (p, q) => Math.abs((p.R ?? NaN) - (q.R ?? NaN)) / 400, // R 的库内典型跨度归一
    replay: (p, q) => ({ metric: 'R', self: p.R, neighbor: q.R }),
    advice: (n, r) => `情绪显影浓度最接近《${n.name}》（${n.author}，R=${r.neighbor} vs 本作 ${r.self}）——可参考该作控制情绪词用量的段落配比：哪里直陈、哪里藏进动作与感官`,
  },
  {
    id: 'arc-shape', label: '情感弧形状',
    dist: (p, q) => { const a = zArc(p.valenceArc), b = zArc(q.valenceArc); return a && b ? 1 - cosine(a, b) : Infinity },
    replay: (p, q) => ({ metric: 'valenceArc', self: p.valenceArc, neighbor: q.valenceArc }),
    advice: (n, r) => `情感弧形状最接近《${n.name}》（${n.author}，弧余弦相似 ${r.sim}）——可参考该作对应十分位的情绪走向安排；两侧弧线逐 bin 值已回放，可直接对照`,
  },
  {
    id: 'rhythm', label: '句流节奏',
    dist: (p, q) => Math.abs((p.H ?? NaN) - (q.H ?? NaN)) / 0.25,
    replay: (p, q) => ({ metric: 'H', self: p.H, neighbor: q.H }),
    advice: (n, r) => `句流节奏（全文句长赫斯特）最接近《${n.name}》（${n.author}，H=${r.neighbor} vs 本作 ${r.self}）——可参考该作的长短句配比与顿挫位置`,
  },
  {
    id: 'dialogue-texture', label: '对白织体',
    dist: (p, q) => {
      const curve = p.dialCurve && q.dialCurve ? 1 - cosine(p.dialCurve, q.dialCurve) : 0.5
      const dMean = Math.abs((p.dialMean ?? 0) - (q.dialMean ?? 0)) / 0.25
      const alt = Math.abs((p.altRate ?? 0) - (q.altRate ?? 0)) / 0.3
      return 0.5 * curve + 0.25 * Math.min(2, dMean) + 0.25 * Math.min(2, alt)
    },
    replay: (p, q) => ({ metric: 'dialCurve', self: p.dialCurve, neighbor: q.dialCurve }),
    advice: (n, r) => `对白织体（占比曲线+交替率）最接近《${n.name}》（${n.author}）——可参考该作的对白场景布点与叙述-对白切换密度`,
  },
  {
    id: 'thread-craft', label: '线索手法',
    dist: (p, q) => Math.abs((p.echo ?? NaN) - (q.echo ?? NaN)) / 0.5 + Math.abs(((p.gaps?.length ?? 0) / Math.max(1, p.topEntities?.length ?? 1)) - ((q.gaps?.length ?? 0) / Math.max(1, q.topEntities?.length ?? 1))),
    replay: (p, q) => ({ metric: 'echo/gap密度', self: `${p.echo}｜${((p.gaps?.length ?? 0) / Math.max(1, p.topEntities?.length ?? 1)).toFixed(2)}`, neighbor: `${q.echo}｜${((q.gaps?.length ?? 0) / Math.max(1, q.topEntities?.length ?? 1)).toFixed(2)}` }),
    advice: (n, r) => `线索手法（首尾呼应+伏笔密度）最接近《${n.name}》（${n.author}）——可参考该作的伏笔埋设/回收节奏；该作正文副本在档案库中，可由 agent 摘引对应段落`,
  },
  {
    id: 'scene-craft', label: '场景手艺',
    dist: (p, q) => {
      const fa = p.sceneFeat, fb = q.sceneFeat
      if (!fa || !fb) return Infinity
      const keys = [
        [fa.nScenes, fb.nScenes, 8],
        [fa.sceneLen.cv, fb.sceneLen.cv, 0.5],
        [fa.valenceSwing, fb.valenceSwing, 60],
        [(fa.openerMix?.dialogue ?? 0) / Math.max(1, fa.nScenes), (fb.openerMix?.dialogue ?? 0) / Math.max(1, fb.nScenes), 0.4],
      ]
      return Math.sqrt(keys.reduce((s, [x, y, sc]) => s + ((x - y) / sc) ** 2, 0))
    },
    replay: (p, q) => ({ metric: '场景节奏', self: `${p.sceneFeat.nScenes}场｜长度CV=${p.sceneFeat.sceneLen.cv}｜情绪σ=${p.sceneFeat.valenceSwing}`, neighbor: `${q.sceneFeat.nScenes}场｜长度CV=${q.sceneFeat.sceneLen.cv}｜情绪σ=${q.sceneFeat.valenceSwing}` }),
    advice: (n, r) => `场景手艺（场景数/长度节奏/场景情绪波动）最接近《${n.name}》（${n.author}）——可参考该作的场景切分粒度与场景间情绪落差安排；双方逐场景结构已入档案（sceneFeat），agent 可逐场景摘引对照`,
  },
]

/**
 * 跨作者迁移检索：每个侧面返回全部他作者作品中的最近 2 篇 + 信号回放。
 * @param {object} profile 输入作品档案
 * @param {object} library 档案库注册表
 * @param {string} root 库根
 * @param {string} anchorAuthor 锚定作者（排除；其对比属输出 A）
 * @param {(author:string)=>object[]} loadDossiers
 */
export function transferSuggestions(profile, library, root, anchorAuthor, loadDossiers) {
  const pool = []
  for (const [author, a] of Object.entries(library.authors ?? {})) {
    if (author === anchorAuthor) continue
    for (const w of a.works) {
      const p = loadDossiers(root, author).find((d) => d && d.name === w.name)
      if (p) pool.push({ author, dossier: p })
    }
  }
  if (pool.length < 2) return { pool: pool.length, aspects: [], note: '他作者样本不足（<2 篇），迁移参考暂不可用——先收录更多作者作品' }
  const aspects = ASPECTS.map((A) => {
    const ranked = pool
      .map(({ author, dossier }) => ({ author, dossier, d: A.dist(profile, dossier) }))
      .filter((x) => Number.isFinite(x.d))
      .sort((a, b) => a.d - b.d)
      .slice(0, 2)
    return {
      id: A.id, label: A.label,
      neighbors: ranked.map(({ author, dossier, d }) => {
        const replay = A.replay(profile, dossier)
        if (A.id === 'arc-shape') replay.sim = r4(1 - d)
        return { work: dossier.name, author, distance: r4(d), replay, advice: A.advice({ name: dossier.name, author }, replay) }
      }),
    }
  })
  return { pool: pool.length, aspects }
}
