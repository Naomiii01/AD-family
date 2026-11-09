// Category icons: a small emoji on a soft tinted tile, one tint family per kind of spending.
// Old names (正餐, 衣物, 文具學習…) keep working so earlier records still get an icon.

type Ic = [emoji: string, tint: string];
const T = { food: "var(--c-s2)", home: "var(--c-s4)", move: "var(--c-s1)", fun: "var(--c-s6)", care: "var(--c-s5)", grow: "var(--c-s3)", bill: "var(--c-s1)", gray: "var(--c-other)" };

const ICONS: Record<string, Ic> = {
  餐飲: ["🍱", T.food], 正餐: ["🍱", T.food], 飲料點心: ["🧋", T.food], 零食: ["🍪", T.food], 飲料: ["🧋", T.food], 吃飯: ["🍱", T.food],
  日用品: ["🧻", T.home], 購物: ["🛍️", T.care], 居住: ["🏠", T.home], 寵物: ["🐾", T.home],
  交通: ["🚌", T.move], 汽車: ["🚗", T.move], 旅遊: ["🧳", T.move],
  娛樂: ["🎮", T.fun], 社交: ["🥂", T.fun], 數位: ["📱", T.fun], 禮物: ["🎁", T.fun],
  服飾: ["👕", T.care], 衣物: ["👕", T.care], 衣服: ["👕", T.care], 美容: ["💄", T.care], 醫療: ["🩺", T.care],
  教育: ["📚", T.grow], 文具學習: ["✏️", T.grow], 文具: ["✏️", T.grow],
  卡費: ["💳", T.bill], 貸款: ["🏦", T.bill], 房租: ["🏠", T.bill], 水電瓦斯網路費: ["💡", T.bill], 保險費: ["🛡️", T.bill], 電話費: ["📞", T.bill],
  兼職: ["💼", T.grow], 兼職打工: ["💼", T.grow], 業外收入: ["📈", T.grow], 獎金: ["🎉", T.grow], 投資收益: ["📈", T.grow],
  紅包禮金: ["🧧", T.fun], 獎學金: ["🎓", T.grow], 比賽獎金: ["🏆", T.grow], 薪資: ["💰", T.grow],
  其他: ["📦", T.gray],
};

export const iconOf = (cat?: string): Ic => ICONS[cat || ""] || ICONS["其他"];

/** Spending categories for grown-ups (kids keep the shorter list in util CATS). */
export const ADULT_CATS = ["餐飲", "飲料點心", "日用品", "購物", "交通", "娛樂", "服飾", "美容", "醫療", "教育", "社交", "寵物", "旅遊", "數位", "居住", "汽車", "禮物", "其他"];
