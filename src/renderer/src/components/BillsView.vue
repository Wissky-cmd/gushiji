<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import RecordFormDialog from './RecordFormDialog.vue'
import { formatMoney } from '../utils/format'
import type { Category, RecordItem } from '../../../shared/types'

const props = defineProps<{ visible: boolean }>()

const currentMonth = ref(dayjs().format('YYYY-MM'))
const records = ref<RecordItem[]>([])
const categories = ref<{ expense: Category[]; income: Category[] }>({ expense: [], income: [] })
const keyword = ref('')
const filterCategoryId = ref<number | null>(null)
const dialogVisible = ref(false)
const editingRecord = ref<RecordItem | null>(null)
const loading = ref(false)

// 分类树：一级作为父节点，二级作为子节点
interface CategoryTree {
  value: number
  label: string
  children: { value: number; label: string }[]
}

function buildTree(list: Category[]): CategoryTree[] {
  return list
    .filter((c) => c.parentId === null)
    .map((p) => ({
      value: p.id,
      label: `${p.icon} ${p.name}`,
      children: list.filter((c) => c.parentId === p.id).map((c) => ({ value: c.id, label: c.name }))
    }))
}

// 分类筛选下拉：支出与收入的一级分组都列出
const filterGroups = computed(() => [
  ...buildTree(categories.value.expense),
  ...buildTree(categories.value.income)
])

async function refreshRecords(): Promise<void> {
  loading.value = true
  try {
    records.value = await window.api.getRecords(currentMonth.value)
  } catch (err) {
    ElMessage.error('读取账目失败：' + (err instanceof Error ? err.message : String(err)))
  } finally {
    loading.value = false
  }
}

async function loadCategories(): Promise<void> {
  const [expense, income] = await Promise.all([
    window.api.getCategories('expense'),
    window.api.getCategories('income')
  ])
  categories.value = { expense, income }
}

onMounted(async () => {
  await loadCategories()
  await refreshRecords()
})

// 回到本页时刷新分类（可能在分类管理页做过增删改）
watch(
  () => props.visible,
  (v) => {
    if (v) loadCategories()
  }
)

// 导出账目：cmd 为 'month' 导出当前月，'all' 导出全部
async function handleExport(cmd: string): Promise<void> {
  const month = cmd === 'month' ? currentMonth.value : null
  try {
    const res = await window.api.exportCsv(month)
    if (res.canceled) return
    if (res.empty) {
      ElMessage.warning('没有可导出的账目')
      return
    }
    ElMessage.success(`已导出 ${res.count} 条账目，用 Excel 打开即可查看`)
  } catch (err) {
    ElMessage.error('导出失败：' + (err instanceof Error ? err.message : String(err)))
  }
}

// 月度汇总（不受筛选影响，统计整月）
const monthExpense = computed(() =>
  records.value.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amountCents, 0)
)
const monthIncome = computed(() =>
  records.value.filter((r) => r.type === 'income').reduce((s, r) => s + r.amountCents, 0)
)
const monthBalance = computed(() => monthIncome.value - monthExpense.value)

// 分类筛选 + 备注搜索
const filteredRecords = computed(() => {
  let list = records.value
  if (filterCategoryId.value) {
    list = list.filter((r) => r.categoryId === filterCategoryId.value)
  }
  const kw = keyword.value.trim()
  if (kw) {
    list = list.filter((r) => r.note.includes(kw))
  }
  return list
})

// 按日期分组，含每日小计
interface DayGroup {
  date: string
  label: string
  expense: number
  income: number
  items: RecordItem[]
}

const dayGroups = computed<DayGroup[]>(() => {
  const map = new Map<string, DayGroup>()
  const today = dayjs()
  for (const r of filteredRecords.value) {
    let g = map.get(r.date)
    if (!g) {
      let label: string
      if (r.date === today.format('YYYY-MM-DD')) label = '今天'
      else if (r.date === today.subtract(1, 'day').format('YYYY-MM-DD')) label = '昨天'
      else label = '周' + '日一二三四五六'[dayjs(r.date).day()]
      g = { date: r.date, label, expense: 0, income: 0, items: [] }
      map.set(r.date, g)
    }
    g.items.push(r)
    if (r.type === 'expense') g.expense += r.amountCents
    else g.income += r.amountCents
  }
  return [...map.values()]
})

function openCreate(): void {
  editingRecord.value = null
  dialogVisible.value = true
}

function openEdit(r: RecordItem): void {
  editingRecord.value = r
  dialogVisible.value = true
}

async function onSaved(): Promise<void> {
  dialogVisible.value = false
  await refreshRecords()
}

async function onDeleted(): Promise<void> {
  dialogVisible.value = false
  await refreshRecords()
}
</script>

<template>
  <div class="bills">
    <header class="toolbar">
      <el-date-picker
        v-model="currentMonth"
        type="month"
        value-format="YYYY-MM"
        :clearable="false"
        style="width: 110px"
        @change="refreshRecords"
      />
      <span class="spacer" />
      <el-input v-model="keyword" placeholder="搜索备注" clearable style="width: 140px">
        <template #prefix>🔍</template>
      </el-input>
      <el-select v-model="filterCategoryId" clearable placeholder="全部分类" style="width: 130px">
        <el-option-group v-for="g in filterGroups" :key="g.label" :label="g.label">
          <el-option v-for="c in g.children" :key="c.value" :label="c.label" :value="c.value" />
        </el-option-group>
      </el-select>
      <el-dropdown trigger="click" @command="handleExport">
        <el-button>导出 ▾</el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="month">导出本月账目</el-dropdown-item>
            <el-dropdown-item command="all">导出全部账目</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-button type="primary" size="large" @click="openCreate">＋ 记一笔</el-button>
    </header>

    <section class="summary">
      <div class="card">
        <div class="label">本月支出</div>
        <div class="num expense">¥ {{ formatMoney(monthExpense) }}</div>
      </div>
      <div class="card">
        <div class="label">本月收入</div>
        <div class="num income">¥ {{ formatMoney(monthIncome) }}</div>
      </div>
      <div class="card">
        <div class="label">本月结余</div>
        <div class="num" :class="monthBalance >= 0 ? 'positive' : 'negative'">
          ¥ {{ formatMoney(monthBalance) }}
        </div>
      </div>
    </section>

    <main v-loading="loading" class="list">
      <div v-for="g in dayGroups" :key="g.date" class="day-group">
        <div class="day-head">
          <span class="date">
            {{ dayjs(g.date).format('MM月DD日') }} <span class="weekday">{{ g.label }}</span>
          </span>
          <span class="day-sum">
            <span v-if="g.expense" class="e">支 ¥{{ formatMoney(g.expense) }}</span>
            <span v-if="g.income" class="i">收 ¥{{ formatMoney(g.income) }}</span>
          </span>
        </div>
        <div v-for="r in g.items" :key="r.id" class="record" @click="openEdit(r)">
          <div class="icon">{{ r.categoryIcon }}</div>
          <div class="info">
            <div class="cname">
              {{ r.categoryName }}
              <span class="pname">{{ r.parentName }}</span>
            </div>
            <div v-if="r.note" class="note">{{ r.note }}</div>
          </div>
          <div class="amount" :class="r.type">
            {{ r.type === 'expense' ? '-' : '+' }}¥{{ formatMoney(r.amountCents) }}
          </div>
        </div>
      </div>
      <el-empty
        v-if="dayGroups.length === 0 && !loading"
        description="本月还没有账目，点击右上角「＋ 记一笔」开始吧"
      />
    </main>

    <RecordFormDialog
      v-model:visible="dialogVisible"
      :record="editingRecord"
      :categories="categories"
      @saved="onSaved"
      @deleted="onDeleted"
    />
  </div>
</template>

<style scoped>
.bills {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 24px;
  background: #fff;
  border-bottom: 1px solid #ebeef5;
  flex-shrink: 0;
}

.spacer {
  flex: 1;
}

.list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 24px 24px;
}

.day-group {
  margin-top: 12px;
}

.day-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 4px;
  font-size: 13px;
  color: #909399;
}

.day-head .weekday {
  margin-left: 6px;
  color: #c0c4cc;
}

.day-sum .e {
  color: #67c23a;
  margin-right: 10px;
}

.day-sum .i {
  color: #f56c6c;
}

.record {
  display: flex;
  align-items: center;
  background: #fff;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 6px;
  cursor: pointer;
  transition: box-shadow 0.15s;
}

.record:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.record .icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #f5f6f8;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  margin-right: 12px;
  flex-shrink: 0;
}

.record .info {
  flex: 1;
  min-width: 0;
}

.record .cname {
  font-size: 14px;
  color: #303133;
}

.record .pname {
  font-size: 12px;
  color: #909399;
  margin-left: 6px;
}

.record .note {
  font-size: 12px;
  color: #c0c4cc;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.record .amount {
  font-size: 15px;
  font-weight: 600;
  margin-left: 12px;
  flex-shrink: 0;
}

.record .amount.expense {
  color: #67c23a;
}

.record .amount.income {
  color: #f56c6c;
}
</style>
