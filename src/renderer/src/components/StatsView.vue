<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import type { EChartsOption } from 'echarts'
import BaseChart from './BaseChart.vue'
import { formatMoney } from '../utils/format'
import type { MonthTrend, RecordItem } from '../../../shared/types'

const currentMonth = ref(dayjs().format('YYYY-MM'))
const records = ref<RecordItem[]>([])
const trend = ref<MonthTrend[]>([])
const loading = ref(false)

async function refreshAll(): Promise<void> {
  loading.value = true
  try {
    const [recs, t] = await Promise.all([
      window.api.getRecords(currentMonth.value),
      window.api.getMonthTrend(12)
    ])
    records.value = recs
    trend.value = t
  } catch (err) {
    ElMessage.error('读取统计数据失败：' + (err instanceof Error ? err.message : String(err)))
  } finally {
    loading.value = false
  }
}

onMounted(refreshAll)

const monthExpense = computed(() =>
  records.value.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amountCents, 0)
)
const monthIncome = computed(() =>
  records.value.filter((r) => r.type === 'income').reduce((s, r) => s + r.amountCents, 0)
)
const monthBalance = computed(() => monthIncome.value - monthExpense.value)

const hasExpense = computed(() => monthExpense.value > 0)

// 支出分类占比：按一级分类汇总，最多显示 8 项，其余并入「其他」
const pieOption = computed<EChartsOption>(() => {
  const byParent = new Map<string, number>()
  for (const r of records.value) {
    if (r.type !== 'expense') continue
    byParent.set(r.parentName, (byParent.get(r.parentName) ?? 0) + r.amountCents)
  }
  let data = [...byParent.entries()].map(([name, value]) => ({ name, value }))
  data.sort((a, b) => b.value - a.value)
  if (data.length > 8) {
    const rest = data.slice(7).reduce((s, d) => s + d.value, 0)
    data = [...data.slice(0, 7), { name: '其他', value: rest }]
  }
  return {
    tooltip: { trigger: 'item', valueFormatter: (v) => `¥ ${(Number(v) / 100).toFixed(2)}` },
    legend: { bottom: 0, type: 'scroll' },
    series: [
      {
        name: '支出占比',
        type: 'pie',
        radius: ['42%', '68%'],
        center: ['50%', '44%'],
        itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
        label: { formatter: '{b} {d}%' },
        data
      }
    ]
  }
})

// 近 12 个月收支趋势（以所选月份为终点往前推 12 个月）
const trendMonths = computed(() => {
  const list: { key: string; label: string }[] = []
  for (let i = 11; i >= 0; i--) {
    const d = dayjs(currentMonth.value).subtract(i, 'month')
    list.push({ key: d.format('YYYY-MM'), label: `${d.month() + 1}月` })
  }
  return list
})

const trendOption = computed<EChartsOption>(() => {
  const map = new Map(trend.value.map((t) => [t.month, t]))
  return {
    tooltip: { trigger: 'axis', valueFormatter: (v) => `¥ ${(Number(v) / 100).toFixed(2)}` },
    legend: { data: ['支出', '收入'], top: 0 },
    grid: { left: 70, right: 16, top: 36, bottom: 28 },
    xAxis: { type: 'category', data: trendMonths.value.map((m) => m.label) },
    yAxis: {
      type: 'value',
      axisLabel: {
        formatter: (v: number) =>
          Math.abs(v) >= 1000000 ? `${v / 1000000}万` : v >= 10000 ? `${v / 10000}万` : `${v / 100}`
      }
    },
    series: [
      {
        name: '支出',
        type: 'bar',
        barMaxWidth: 26,
        itemStyle: { color: '#67c23a', borderRadius: [4, 4, 0, 0] },
        data: trendMonths.value.map((m) => map.get(m.key)?.expense ?? 0)
      },
      {
        name: '收入',
        type: 'bar',
        barMaxWidth: 26,
        itemStyle: { color: '#f56c6c', borderRadius: [4, 4, 0, 0] },
        data: trendMonths.value.map((m) => map.get(m.key)?.income ?? 0)
      }
    ]
  }
})
</script>

<template>
  <div v-loading="loading" class="stats">
    <header class="toolbar">
      <span class="title">统计报表</span>
      <el-date-picker
        v-model="currentMonth"
        type="month"
        value-format="YYYY-MM"
        :clearable="false"
        style="width: 120px"
        @change="refreshAll"
      />
    </header>

    <section class="summary">
      <div class="card">
        <div class="label">{{ currentMonth }} 支出</div>
        <div class="num expense">¥ {{ formatMoney(monthExpense) }}</div>
      </div>
      <div class="card">
        <div class="label">{{ currentMonth }} 收入</div>
        <div class="num income">¥ {{ formatMoney(monthIncome) }}</div>
      </div>
      <div class="card">
        <div class="label">{{ currentMonth }} 结余</div>
        <div class="num" :class="monthBalance >= 0 ? 'positive' : 'negative'">
          ¥ {{ formatMoney(monthBalance) }}
        </div>
      </div>
    </section>

    <section class="charts">
      <div class="chart-card">
        <div class="chart-title">支出分类占比</div>
        <div class="chart-box">
          <BaseChart v-if="hasExpense" :option="pieOption" />
          <el-empty
            v-else
            description="本月还没有支出，记一笔后这里会出现统计图"
            :image-size="72"
          />
        </div>
      </div>
      <div class="chart-card wide">
        <div class="chart-title">近 12 个月收支趋势</div>
        <div class="chart-box">
          <BaseChart :option="trendOption" />
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.stats {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 24px;
  background: #fff;
  border-bottom: 1px solid #ebeef5;
  flex-shrink: 0;
}

.title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.charts {
  flex: 1;
  display: flex;
  gap: 16px;
  padding: 12px 24px 24px;
  min-height: 0;
}

.chart-card {
  flex: 1;
  min-width: 0;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  padding: 16px 20px;
}

.chart-card.wide {
  flex: 1.6;
}

.chart-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 8px;
}

.chart-box {
  flex: 1;
  min-height: 0;
}
</style>
