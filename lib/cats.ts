// Category icons: a cute 3D picture (Microsoft Fluent Emoji, MIT) on a soft round tile, one tint family per kind of spending.
// The emoji is the fallback if the picture can't load. Old names (正餐, 衣物, 文具學習…) keep working.

type Ic = [img: string, emoji: string, tint: string];
const T = { food: "var(--c-s2)", home: "var(--c-s4)", move: "var(--c-s1)", fun: "var(--c-s6)", care: "var(--c-s5)", grow: "var(--c-s3)", bill: "var(--c-s1)", gray: "var(--c-other)" };

const meal: Ic = ["steaming_bowl", "🍜", T.food], drink: Ic = ["bubble_tea", "🧋", T.food], shirt: Ic = ["t_shirt", "👕", T.care], pen: Ic = ["pencil", "✏️", T.grow], job: Ic = ["briefcase", "💼", T.grow], home: Ic = ["house", "🏠", T.home];
const ICONS: Record<string, Ic> = {
  餐飲: meal, 正餐: meal, 吃飯: ["bento_box", "🍱", T.food], 飲料點心: drink, 飲料: drink, 零食: ["cookie", "🍪", T.food],
  日用品: ["roll_of_paper", "🧻", T.home], 購物: ["shopping_bags", "🛍️", T.care], 居住: home, 寵物: ["cat_face", "🐱", T.home],
  交通: ["bus", "🚌", T.move], 汽車: ["automobile", "🚗", T.move], 旅遊: ["luggage", "🧳", T.move],
  娛樂: ["video_game", "🎮", T.fun], 社交: ["clinking_glasses", "🥂", T.fun], 數位: ["mobile_phone", "📱", T.fun], 禮物: ["wrapped_gift", "🎁", T.fun],
  服飾: shirt, 衣物: shirt, 衣服: shirt, 美容: ["lipstick", "💄", T.care], 醫療: ["pill", "💊", T.care],
  教育: ["books", "📚", T.grow], 文具學習: pen, 文具: pen,
  卡費: ["credit_card", "💳", T.bill], 貸款: ["bank", "🏦", T.bill], 房租: home, 水電瓦斯網路費: ["light_bulb", "💡", T.bill], 保險費: ["shield", "🛡️", T.bill], 電話費: ["telephone_receiver", "📞", T.bill],
  兼職: job, 兼職打工: job, 業外收入: ["chart_increasing", "📈", T.grow], 獎金: ["party_popper", "🎉", T.grow], 投資收益: ["chart_increasing", "📈", T.grow],
  紅包禮金: ["red_envelope", "🧧", T.fun], 獎學金: ["graduation_cap", "🎓", T.grow], 比賽獎金: ["trophy", "🏆", T.grow], 薪資: ["money_bag", "💰", T.grow],
  其他: ["package", "📦", T.gray],
};

export const iconOf = (cat?: string): Ic => ICONS[cat || ""] || ICONS["其他"];
/** Picture URL; the 體驗版 page carries the pictures inline. */
export const catImg = (name: string) => (typeof window !== "undefined" && (window as any).__CAT_IMG?.[name]) || `/cat/${name}.webp`;

/** Spending categories for grown-ups (kids keep the shorter list in util CATS). */
export const ADULT_CATS = ["餐飲", "飲料點心", "日用品", "購物", "交通", "娛樂", "服飾", "美容", "醫療", "教育", "社交", "寵物", "旅遊", "數位", "居住", "汽車", "禮物", "其他"];
