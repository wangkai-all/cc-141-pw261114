/**
 * Sample project data.
 *
 * Three complete cases, each with a parent/child work-package forest, two
 * baseline versions, cost records that separate the occurrence date from the
 * registration date, and deliberately awkward packages (zero earned value,
 * zero cost, not started, no measurement method).
 *
 *  A — 延期：both schedule slip and late cost entries
 *  B — 提前采购：future-dated purchase committed early
 *  C — 范围增加：a new work package that only exists in the current baseline
 */

const constraint = '本项目的成本记录同时保留发生日期与登记日期；重开历史报表时可选「当时已知」或「当前更正」口径';

export const SAMPLES = {
  delay: {
    id: 'delay',
    name: '延期样本 · 城北道路改造',
    shortName: '延期样本',
    description: '工期整体后移，部分费用在截止日期后才补录；含未开工、零挣值与未设计量工作包。',
    scenario: 'delayed',
    project: {
      name: '城北道路改造工程',
      startDate: '2026-04-01',
      finishDate: '2026-12-31',
      currency: 'CNY',
      asOfDefault: '2026-10-31',
    },
    baselines: [
      {
        id: 'BL-A1',
        label: '基线 v1 · 原计划',
        createdAt: '2026-04-01',
        reason: '合同原始计划',
        isCurrent: false,
        items: [
          { packageId: 'A1-1', bac: 960000, start: '2026-04-01', finish: '2026-07-31' },
          { packageId: 'A1-2', bac: 280000, start: '2026-06-01', finish: '2026-08-31' },
          { packageId: 'A2', bac: 1200000, start: '2026-07-01', finish: '2026-09-30' },
          { packageId: 'A3-1', bac: 540000, start: '2026-05-01', finish: '2026-08-31' },
          { packageId: 'A3-2', bac: 160000, start: '2026-07-01', finish: '2026-09-15' },
          { packageId: 'A4', bac: 320000, start: '2026-10-01', finish: '2026-11-30' },
          { packageId: 'A5', bac: 180000, start: '2026-09-01', finish: '2026-10-31' },
          { packageId: 'A6', bac: 90000, start: '2026-04-01', finish: '2026-12-31' },
        ],
      },
      {
        id: 'BL-A2',
        label: '基线 v2 · 工期顺延',
        createdAt: '2026-09-15',
        reason: '管线迁改滞后，路面与交通设施完工日期顺延 60 天',
        isCurrent: true,
        items: [
          { packageId: 'A1-1', bac: 960000, start: '2026-04-01', finish: '2026-08-31' },
          { packageId: 'A1-2', bac: 280000, start: '2026-06-01', finish: '2026-09-30' },
          { packageId: 'A2', bac: 1200000, start: '2026-07-15', finish: '2026-11-30' },
          { packageId: 'A3-1', bac: 540000, start: '2026-05-01', finish: '2026-09-30' },
          { packageId: 'A3-2', bac: 160000, start: '2026-07-01', finish: '2026-10-15' },
          { packageId: 'A4', bac: 320000, start: '2026-11-01', finish: '2026-12-31' },
          { packageId: 'A5', bac: 180000, start: '2026-09-01', finish: '2026-11-15' },
          { packageId: 'A6', bac: 90000, start: '2026-04-01', finish: '2026-12-31' },
        ],
      },
    ],
    scopeEvents: [
      { date: '2026-09-15', type: '延期', summary: '管线迁改滞后，路面与交通设施完工日期顺延 60 天', bacDelta: 0, scheduleDeltaDays: 60 },
    ],
    assumptions: [
      constraint,
      '计划价值按新基线 v1/v2 窗口线性推进；旧基线仍按原日期计算，不回写',
      '截止日期 2026-10-31，之后登记的费用只在「当前更正」口径可见',
    ],
    forecast: {
      scenarioEtc: 860000,
      assumptions: [
        '基准情景：剩余工作按当前 CPI 推进（需 CPI 有定义）',
        '用户情景：剩余成本 86 万，考虑路面班组加班与二次进场',
      ],
    },
    packages: [
      {
        id: 'A1', name: '路基工程', parentId: null,
        bac: 0,
        progress: {},
        costs: [],
      },
      {
        id: 'A1-1', name: '土方开挖', parentId: 'A1',
        bac: 960000,
        baselineStart: '2026-04-01', baselineFinish: '2026-08-31',
        progress: {
          method: 'quantity', plannedQuantity: 48000, completedQuantity: 43200, unit: 'm³',
          history: [
            { date: '2026-05-31', completedQuantity: 11200 },
            { date: '2026-06-30', completedQuantity: 20800 },
            { date: '2026-07-31', completedQuantity: 29600 },
            { date: '2026-08-31', completedQuantity: 35200 },
            { date: '2026-09-30', completedQuantity: 40200 },
            { date: '2026-10-31', completedQuantity: 43200 },
          ],
        },
        costs: [
          { id: 'C-A1-01', effectiveDate: '2026-05-10', recordedDate: '2026-05-15', amount: 148000, category: '机械台班', note: '土方开挖第一阶段' },
          { id: 'C-A1-02', effectiveDate: '2026-06-20', recordedDate: '2026-06-24', amount: 202000, category: '机械台班', note: '第二阶段' },
          { id: 'C-A1-03', effectiveDate: '2026-07-31', recordedDate: '2026-08-05', amount: 186000, category: '外运', note: '弃土外运' },
          { id: 'C-A1-04', effectiveDate: '2026-08-31', recordedDate: '2026-09-04', amount: 151000, category: '机械台班', note: '收尾' },
          { id: 'C-A1-05', effectiveDate: '2026-09-30', recordedDate: '2026-10-06', amount: 96000, category: '外运', note: '雨季返工' },
          { id: 'C-A1-06', effectiveDate: '2026-09-30', recordedDate: '2026-11-08', amount: 142000, category: '整改', note: '边坡塌方整改，10 月才完成结算' },
        ],
      },
      {
        id: 'A1-2', name: '边坡防护', parentId: 'A1',
        bac: 280000,
        baselineStart: '2026-06-01', baselineFinish: '2026-09-30',
        progress: {
          method: 'milestone',
          milestones: [
            { name: '坡面清表', weight: 20, completed: true, completedDate: '2026-06-28' },
            { name: '锚杆施工', weight: 45, completed: true, completedDate: '2026-08-18' },
            { name: '格构梁浇筑', weight: 35, completed: false },
          ],
        },
        costs: [
          { id: 'C-A1-07', effectiveDate: '2026-07-05', recordedDate: '2026-07-10', amount: 58000, category: '材料', note: '锚杆' },
          { id: 'C-A1-08', effectiveDate: '2026-08-31', recordedDate: '2026-09-06', amount: 77000, category: '劳务', note: '锚杆张拉' },
        ],
      },
      {
        id: 'A2', name: '沥青路面', parentId: null,
        bac: 1200000,
        baselineStart: '2026-07-15', baselineFinish: '2026-11-30',
        progress: {
          method: 'milestone',
          milestones: [
            { name: '沥青拌合站就位', weight: 10, completed: true, completedDate: '2026-07-22' },
            { name: '下面层摊铺', weight: 30, completed: true, completedDate: '2026-09-12' },
            { name: '中面层摊铺', weight: 30, completed: true, completedDate: '2026-10-22' },
            { name: '上面层摊铺', weight: 30, completed: false },
          ],
        },
        costs: [
          { id: 'C-A2-01', effectiveDate: '2026-07-31', recordedDate: '2026-08-04', amount: 132000, category: '材料', note: '改性沥青' },
          { id: 'C-A2-02', effectiveDate: '2026-09-30', recordedDate: '2026-10-05', amount: 298000, category: '材料', note: '下面层混合料' },
          { id: 'C-A2-03', effectiveDate: '2026-10-31', recordedDate: '2026-11-11', amount: 214000, category: '摊铺', note: '中面层摊铺，11 月补录' },
        ],
      },
      {
        id: 'A3', name: '排水与附属', parentId: null,
        bac: 0,
        progress: {},
        costs: [],
      },
      {
        id: 'A3-1', name: '雨水管道', parentId: 'A3',
        bac: 540000,
        baselineStart: '2026-05-01', baselineFinish: '2026-09-30',
        progress: {
          method: 'quantity', plannedQuantity: 3600, completedQuantity: 3240, unit: 'm',
          history: [
            { date: '2026-06-30', completedQuantity: 800 },
            { date: '2026-07-31', completedQuantity: 1650 },
            { date: '2026-08-31', completedQuantity: 2480 },
            { date: '2026-09-30', completedQuantity: 3010 },
            { date: '2026-10-31', completedQuantity: 3240 },
          ],
        },
        costs: [
          { id: 'C-A3-01', effectiveDate: '2026-06-15', recordedDate: '2026-06-19', amount: 96000, category: '管材', note: '承插管进场' },
          { id: 'C-A3-02', effectiveDate: '2026-08-15', recordedDate: '2026-08-21', amount: 124000, category: '土方', note: '沟槽开挖' },
          { id: 'C-A3-03', effectiveDate: '2026-09-30', recordedDate: '2026-10-08', amount: 88000, category: '安装', note: '管道安装' },
        ],
      },
      {
        id: 'A3-2', name: '检查井', parentId: 'A3',
        bac: 160000,
        baselineStart: '2026-07-01', baselineFinish: '2026-10-15',
        progress: {
          method: 'weighted',
          steps: [
            { name: '井室砌筑', weight: 40, percent: 0.9, history: [{ date: '2026-08-31', percent: 0.5 }, { date: '2026-09-30', percent: 0.9 }] },
            { name: '井盖安装', weight: 60, percent: 0.3, history: [{ date: '2026-09-30', percent: 0.2 }, { date: '2026-10-31', percent: 0.3 }] },
          ],
        },
        costs: [
          { id: 'C-A3-04', effectiveDate: '2026-08-31', recordedDate: '2026-09-03', amount: 42000, category: '材料', note: '砖与砂浆' },
          { id: 'C-A3-05', effectiveDate: '2026-10-20', recordedDate: '2026-10-26', amount: 16000, category: '井盖', note: '井盖进场' },
        ],
      },
      {
        id: 'A4', name: '交通设施', parentId: null,
        bac: 320000,
        baselineStart: '2026-11-01', baselineFinish: '2026-12-31',
        progress: {
          method: 'milestone',
          milestones: [
            { name: '标线施工', weight: 40, completed: false },
            { name: '信号灯安装', weight: 40, completed: false },
            { name: '标志牌安装', weight: 20, completed: false },
          ],
        },
        costs: [],
      },
      {
        id: 'A5', name: '绿化恢复', parentId: null,
        bac: 180000,
        baselineStart: '2026-09-01', baselineFinish: '2026-11-15',
        progress: {},
        costs: [],
      },
      {
        id: 'A6', name: '临时工程', parentId: null,
        bac: 90000,
        baselineStart: '2026-04-01', baselineFinish: '2026-12-31',
        progress: {
          method: 'quantity', plannedQuantity: 100, completedQuantity: 0, unit: '%',
          history: [{ date: '2026-09-30', completedQuantity: 0 }],
        },
        costs: [
          { id: 'C-A6-01', effectiveDate: '2026-05-31', recordedDate: '2026-06-02', amount: 24000, category: '临建', note: '围挡与便道维护' },
        ],
      },
    ],
  },

  procurement: {
    id: 'procurement',
    name: '提前采购样本 · 变电站扩建',
    shortName: '提前采购样本',
    description: '设备提前采购付款，发生日期晚于截止日期；含未来日期的付款承诺与迟登记发票。',
    scenario: 'procurement',
    project: {
      name: '城南变电站扩建工程',
      startDate: '2026-03-01',
      finishDate: '2026-12-31',
      currency: 'CNY',
      asOfDefault: '2026-10-31',
    },
    baselines: [
      {
        id: 'BL-B1',
        label: '基线 v1 · 初设',
        createdAt: '2026-03-01',
        reason: '初设批复版本',
        isCurrent: false,
        items: [
          { packageId: 'B1-1', bac: 2400000, start: '2026-03-01', finish: '2026-09-30' },
          { packageId: 'B1-2', bac: 260000, start: '2026-03-01', finish: '2026-08-31' },
          { packageId: 'B2-1', bac: 380000, start: '2026-04-01', finish: '2026-07-31' },
          { packageId: 'B2-2', bac: 620000, start: '2026-06-01', finish: '2026-10-31' },
          { packageId: 'B3', bac: 280000, start: '2026-10-01', finish: '2026-12-15' },
          { packageId: 'B4', bac: 150000, start: '2026-05-01', finish: '2026-10-31' },
          { packageId: 'B5', bac: 80000, start: '2026-09-01', finish: '2026-11-30' },
        ],
      },
      {
        id: 'BL-B2',
        label: '基线 v2 · 设备到货推迟',
        createdAt: '2026-08-25',
        reason: '主变压器到货推迟 45 天，安装与调试相应后移',
        isCurrent: true,
        items: [
          { packageId: 'B1-1', bac: 2400000, start: '2026-03-01', finish: '2026-11-15' },
          { packageId: 'B1-2', bac: 260000, start: '2026-03-01', finish: '2026-09-30' },
          { packageId: 'B2-1', bac: 380000, start: '2026-04-01', finish: '2026-08-31' },
          { packageId: 'B2-2', bac: 620000, start: '2026-06-01', finish: '2026-11-30' },
          { packageId: 'B3', bac: 280000, start: '2026-11-01', finish: '2026-12-31' },
          { packageId: 'B4', bac: 150000, start: '2026-05-01', finish: '2026-10-31' },
          { packageId: 'B5', bac: 80000, start: '2026-09-01', finish: '2026-11-30' },
        ],
      },
    ],
    scopeEvents: [
      { date: '2026-08-25', type: '延期', summary: '主变压器到货推迟 45 天', bacDelta: 0, scheduleDeltaDays: 45 },
    ],
    assumptions: [
      constraint,
      '提前采购：付款承诺在承诺日期登记，但成本只在设备实际到货/交付的日期计入',
      '截止日期 2026-10-31，未来日期付款承诺不计入实际成本，仅在原始记录中标注',
    ],
    forecast: {
      scenarioEtc: 420000,
      assumptions: [
        '基准情景：剩余工作按当前 CPI 推进（需 CPI 有定义）',
        '用户情景：剩余成本 42 万，按已签设备合同与安装计划测算',
      ],
    },
    packages: [
      { id: 'B1', name: '设备采购', parentId: null, bac: 0, progress: {}, costs: [] },
      {
        id: 'B1-1', name: '主变压器采购', parentId: 'B1',
        bac: 2400000,
        baselineStart: '2026-03-01', baselineFinish: '2026-11-15',
        progress: {
          method: 'milestone',
          milestones: [
            { name: '合同签订', weight: 10, completed: true, completedDate: '2026-04-10' },
            { name: '设备到货', weight: 40, completed: true, completedDate: '2026-09-28' },
            { name: '安装就位', weight: 20, completed: false },
            { name: '交接试验', weight: 30, completed: false },
          ],
        },
        costs: [
          { id: 'C-B1-01', effectiveDate: '2026-04-15', recordedDate: '2026-04-18', amount: 480000, category: '预付款', note: '合同预付款 20%' },
          { id: 'C-B1-02', effectiveDate: '2026-09-30', recordedDate: '2026-10-09', amount: 720000, category: '到货款', note: '设备到货付款' },
          { id: 'C-B1-03', effectiveDate: '2026-08-20', recordedDate: '2026-11-04', amount: 96000, category: '运输', note: '大件运输费，11 月才收到发票' },
          { id: 'C-B1-04', effectiveDate: '2026-12-15', recordedDate: '2026-10-20', amount: 960000, category: '尾款', note: '验收尾款承诺，尚未发生' },
        ],
      },
      {
        id: 'B1-2', name: '电缆与母线', parentId: 'B1',
        bac: 260000,
        baselineStart: '2026-03-01', baselineFinish: '2026-09-30',
        progress: {
          method: 'quantity', plannedQuantity: 5200, completedQuantity: 4940, unit: 'm',
          history: [
            { date: '2026-05-31', completedQuantity: 980 },
            { date: '2026-07-31', completedQuantity: 3120 },
            { date: '2026-09-30', completedQuantity: 4680 },
            { date: '2026-10-31', completedQuantity: 4940 },
          ],
        },
        costs: [
          { id: 'C-B1-05', effectiveDate: '2026-06-30', recordedDate: '2026-07-03', amount: 112000, category: '材料', note: '高压电缆' },
          { id: 'C-B1-06', effectiveDate: '2026-09-30', recordedDate: '2026-10-06', amount: 88000, category: '材料', note: '母线桥' },
        ],
      },
      { id: 'B2', name: '土建安装', parentId: null, bac: 0, progress: {}, costs: [] },
      {
        id: 'B2-1', name: '设备基础', parentId: 'B2',
        bac: 380000,
        baselineStart: '2026-04-01', baselineFinish: '2026-08-31',
        progress: {
          method: 'quantity', plannedQuantity: 1000, completedQuantity: 1000, unit: 'm³',
          history: [
            { date: '2026-05-31', completedQuantity: 300 },
            { date: '2026-06-30', completedQuantity: 720 },
            { date: '2026-07-31', completedQuantity: 1000 },
          ],
        },
        costs: [
          { id: 'C-B2-01', effectiveDate: '2026-05-31', recordedDate: '2026-06-04', amount: 78000, category: '混凝土', note: '基础浇筑' },
          { id: 'C-B2-02', effectiveDate: '2026-07-31', recordedDate: '2026-08-05', amount: 146000, category: '钢筋', note: '钢筋与预埋件' },
          { id: 'C-B2-03', effectiveDate: '2026-07-31', recordedDate: '2026-11-02', amount: 92000, category: '土方', note: '回填结算，11 月补录' },
        ],
      },
      {
        id: 'B2-2', name: '钢结构安装', parentId: 'B2',
        bac: 620000,
        baselineStart: '2026-06-01', baselineFinish: '2026-11-30',
        progress: {
          method: 'weighted',
          steps: [
            { name: '构件加工', weight: 30, percent: 1, history: [{ date: '2026-07-31', percent: 0.8 }, { date: '2026-08-31', percent: 1 }] },
            { name: '现场吊装', weight: 45, percent: 0.7, history: [{ date: '2026-09-30', percent: 0.4 }, { date: '2026-10-31', percent: 0.7 }] },
            { name: '防腐防火', weight: 25, percent: 0.2, history: [{ date: '2026-10-31', percent: 0.2 }] },
          ],
        },
        costs: [
          { id: 'C-B2-04', effectiveDate: '2026-08-31', recordedDate: '2026-09-07', amount: 164000, category: '加工', note: '钢构件加工' },
          { id: 'C-B2-05', effectiveDate: '2026-10-31', recordedDate: '2026-11-06', amount: 132000, category: '吊装', note: '吊装台班，11 月登记' },
        ],
      },
      {
        id: 'B3', name: '调试与验收', parentId: null,
        bac: 280000,
        baselineStart: '2026-11-01', baselineFinish: '2026-12-31',
        progress: {
          method: 'milestone',
          milestones: [
            { name: '单体调试', weight: 40, completed: false },
            { name: '系统联调', weight: 40, completed: false },
            { name: '竣工验收', weight: 20, completed: false },
          ],
        },
        costs: [],
      },
      {
        id: 'B4', name: '备品备件', parentId: null,
        bac: 150000,
        baselineStart: '2026-05-01', baselineFinish: '2026-10-31',
        progress: {
          method: 'quantity', plannedQuantity: 60, completedQuantity: 0, unit: '套',
          history: [{ date: '2026-09-30', completedQuantity: 0 }],
        },
        costs: [
          { id: 'C-B4-01', effectiveDate: '2026-06-15', recordedDate: '2026-06-19', amount: 35000, category: '预付款', note: '备件定金，尚未到货' },
        ],
      },
      {
        id: 'B5', name: '技术资料', parentId: null,
        bac: 80000,
        baselineStart: '2026-09-01', baselineFinish: '2026-11-30',
        progress: {},
        costs: [],
      },
    ],
  },

  scope: {
    id: 'scope',
    name: '范围增加样本 · 科创中心',
    shortName: '范围增加样本',
    description: '新增地下车库工作包，只存在于新基线；旧基线保留原范围，偏差不被回写抹平。',
    scenario: 'scope',
    project: {
      name: '科创中心一期工程',
      startDate: '2026-03-15',
      finishDate: '2027-03-31',
      currency: 'CNY',
      asOfDefault: '2026-10-31',
    },
    baselines: [
      {
        id: 'BL-C1',
        label: '基线 v1 · 原合同范围',
        createdAt: '2026-03-15',
        reason: '原合同范围，不含地下车库',
        isCurrent: false,
        items: [
          { packageId: 'C1-1', bac: 1600000, start: '2026-03-15', finish: '2026-10-31' },
          { packageId: 'C1-2', bac: 900000, start: '2026-04-01', finish: '2026-11-30' },
          { packageId: 'C2-1', bac: 520000, start: '2026-06-01', finish: '2026-12-31' },
          { packageId: 'C2-2', bac: 780000, start: '2026-07-01', finish: '2027-01-31' },
          { packageId: 'C4', bac: 260000, start: '2027-01-01', finish: '2027-03-31' },
          { packageId: 'C5', bac: 140000, start: '2026-03-15', finish: '2027-03-31' },
        ],
      },
      {
        id: 'BL-C2',
        label: '基线 v2 · 增加地下车库',
        createdAt: '2026-08-20',
        reason: '业主新增地下车库 1.15 万㎡，范围与预算同步调整',
        isCurrent: true,
        items: [
          { packageId: 'C1-1', bac: 1600000, start: '2026-03-15', finish: '2026-10-31' },
          { packageId: 'C1-2', bac: 900000, start: '2026-04-01', finish: '2026-11-30' },
          { packageId: 'C2-1', bac: 520000, start: '2026-06-01', finish: '2026-12-31' },
          { packageId: 'C2-2', bac: 780000, start: '2026-07-01', finish: '2027-01-31' },
          { packageId: 'C3', bac: 1150000, start: '2026-09-01', finish: '2027-03-31' },
          { packageId: 'C4', bac: 260000, start: '2027-01-01', finish: '2027-03-31' },
          { packageId: 'C5', bac: 140000, start: '2026-03-15', finish: '2027-03-31' },
        ],
      },
    ],
    scopeEvents: [
      { date: '2026-08-20', type: '范围增加', summary: '新增地下车库工作包，预算 115 万', bacDelta: 1150000, scheduleDeltaDays: 90 },
    ],
    assumptions: [
      constraint,
      '新范围只写入基线 v2；旧基线 v1 的预算与日期保持不变，便于并排对照',
      '截止日期 2026-10-31，车库开工 2 个月，剩余成本为估算',
    ],
    forecast: {
      scenarioEtc: 290000,
      assumptions: [
        '基准情景：剩余工作按当前 CPI 推进（需 CPI 有定义）',
        '用户情景：剩余成本 29 万，按车库新增范围与机电收尾测算',
      ],
    },
    packages: [
      { id: 'C1', name: '主体结构', parentId: null, bac: 0, progress: {}, costs: [] },
      {
        id: 'C1-1', name: '混凝土结构', parentId: 'C1',
        bac: 1600000,
        baselineStart: '2026-03-15', baselineFinish: '2026-10-31',
        progress: {
          method: 'quantity', plannedQuantity: 8000, completedQuantity: 6800, unit: 'm³',
          history: [
            { date: '2026-05-31', completedQuantity: 1200 },
            { date: '2026-06-30', completedQuantity: 2800 },
            { date: '2026-07-31', completedQuantity: 4400 },
            { date: '2026-08-31', completedQuantity: 5600 },
            { date: '2026-09-30', completedQuantity: 6400 },
            { date: '2026-10-31', completedQuantity: 6800 },
          ],
        },
        costs: [
          { id: 'C-C1-01', effectiveDate: '2026-05-31', recordedDate: '2026-06-05', amount: 286000, category: '混凝土', note: '地下二层' },
          { id: 'C-C1-02', effectiveDate: '2026-07-31', recordedDate: '2026-08-06', amount: 412000, category: '混凝土', note: '地上结构' },
          { id: 'C-C1-03', effectiveDate: '2026-09-30', recordedDate: '2026-10-09', amount: 368000, category: '模板', note: '模板与支撑' },
          { id: 'C-C1-04', effectiveDate: '2026-09-30', recordedDate: '2026-11-03', amount: 175000, category: '劳务', note: '劳务结算，11 月登记' },
        ],
      },
      {
        id: 'C1-2', name: '钢筋工程', parentId: 'C1',
        bac: 900000,
        baselineStart: '2026-04-01', baselineFinish: '2026-11-30',
        progress: {
          method: 'quantity', plannedQuantity: 1200, completedQuantity: 1020, unit: 't',
          history: [
            { date: '2026-06-30', completedQuantity: 240 },
            { date: '2026-08-31', completedQuantity: 660 },
            { date: '2026-10-31', completedQuantity: 1020 },
          ],
        },
        costs: [
          { id: 'C-C1-05', effectiveDate: '2026-06-30', recordedDate: '2026-07-04', amount: 198000, category: '钢筋', note: '第一批进场' },
          { id: 'C-C1-06', effectiveDate: '2026-09-30', recordedDate: '2026-10-07', amount: 264000, category: '钢筋', note: '第二批进场' },
        ],
      },
      { id: 'C2', name: '机电安装', parentId: null, bac: 0, progress: {}, costs: [] },
      {
        id: 'C2-1', name: '给排水', parentId: 'C2',
        bac: 520000,
        baselineStart: '2026-06-01', baselineFinish: '2026-12-31',
        progress: {
          method: 'weighted',
          steps: [
            { name: '管道预埋', weight: 40, percent: 0.85, history: [{ date: '2026-09-30', percent: 0.7 }, { date: '2026-10-31', percent: 0.85 }] },
            { name: '设备安装', weight: 40, percent: 0.4, history: [{ date: '2026-10-31', percent: 0.4 }] },
            { name: '试压冲洗', weight: 20, percent: 0, history: [] },
          ],
        },
        costs: [
          { id: 'C-C2-01', effectiveDate: '2026-09-30', recordedDate: '2026-10-05', amount: 146000, category: '管材', note: '镀锌管材' },
          { id: 'C-C2-02', effectiveDate: '2026-10-31', recordedDate: '2026-11-07', amount: 78000, category: '设备', note: '水泵机组，11 月登记' },
        ],
      },
      {
        id: 'C2-2', name: '电气', parentId: 'C2',
        bac: 780000,
        baselineStart: '2026-07-01', baselineFinish: '2027-01-31',
        progress: {
          method: 'milestone',
          milestones: [
            { name: '桥架安装', weight: 25, completed: true, completedDate: '2026-10-05' },
            { name: '电缆敷设', weight: 35, completed: false },
            { name: '配电柜安装', weight: 25, completed: false },
            { name: '送电调试', weight: 15, completed: false },
          ],
        },
        costs: [
          { id: 'C-C2-03', effectiveDate: '2026-10-15', recordedDate: '2026-10-22', amount: 132000, category: '桥架', note: '桥架与支架' },
        ],
      },
      {
        id: 'C3', name: '新增地下车库', parentId: null,
        bac: 1150000,
        baselineStart: '2026-09-01', baselineFinish: '2027-03-31',
        progress: {
          method: 'quantity', plannedQuantity: 100, completedQuantity: 35, unit: '%',
          history: [
            { date: '2026-09-30', completedQuantity: 12 },
            { date: '2026-10-31', completedQuantity: 35 },
          ],
        },
        costs: [
          { id: 'C-C3-01', effectiveDate: '2026-09-30', recordedDate: '2026-10-08', amount: 86000, category: '土方', note: '基坑土方' },
          { id: 'C-C3-02', effectiveDate: '2026-10-31', recordedDate: '2026-11-05', amount: 148000, category: '支护', note: '支护与降水，11 月登记' },
        ],
      },
      {
        id: 'C4', name: '室外工程', parentId: null,
        bac: 260000,
        baselineStart: '2027-01-01', baselineFinish: '2027-03-31',
        progress: {
          method: 'milestone',
          milestones: [
            { name: '管网', weight: 50, completed: false },
            { name: '道路与绿化', weight: 50, completed: false },
          ],
        },
        costs: [],
      },
      {
        id: 'C5', name: '临时设施', parentId: null,
        bac: 140000,
        baselineStart: '2026-03-15', baselineFinish: '2027-03-31',
        progress: {
          method: 'milestone',
          milestones: [
            { name: '临建搭设', weight: 60, completed: true, completedDate: '2026-04-10' },
            { name: '拆除恢复', weight: 40, completed: false },
          ],
        },
        costs: [],
      },
    ],
  },
};

export const SAMPLE_LIST = Object.values(SAMPLES).map(({ id, name, shortName, description, scenario }) => ({
  id, name, shortName, description, scenario,
}));

export function getSample(id) {
  return SAMPLES[id] || SAMPLES.delay;
}
