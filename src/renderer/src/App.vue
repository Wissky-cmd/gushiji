<script setup lang="ts">
import { ref } from 'vue'
import BillsView from './components/BillsView.vue'
import StatsView from './components/StatsView.vue'
import CategoryView from './components/CategoryView.vue'

const active = ref<'bills' | 'stats' | 'cats'>('bills')
</script>

<template>
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">🐴 黑马记账</div>
      <nav class="nav">
        <div class="nav-item" :class="{ active: active === 'bills' }" @click="active = 'bills'">
          📒 账单
        </div>
        <div class="nav-item" :class="{ active: active === 'stats' }" @click="active = 'stats'">
          📊 统计
        </div>
        <div class="nav-item" :class="{ active: active === 'cats' }" @click="active = 'cats'">
          🏷️ 分类
        </div>
      </nav>
      <div class="sidebar-footer">v0.1.0</div>
    </aside>
    <main class="content">
      <!-- 页面都保持挂载，切换时不会丢失各自的筛选状态，并在重新显示时刷新数据 -->
      <BillsView v-show="active === 'bills'" :visible="active === 'bills'" />
      <StatsView v-show="active === 'stats'" :visible="active === 'stats'" />
      <CategoryView v-show="active === 'cats'" :visible="active === 'cats'" />
    </main>
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  height: 100vh;
}

.sidebar {
  width: 168px;
  background: #fff;
  border-right: 1px solid #ebeef5;
  display: flex;
  flex-direction: column;
  padding: 18px 12px 14px;
  flex-shrink: 0;
}

.brand {
  font-size: 17px;
  font-weight: 700;
  color: #303133;
  padding: 0 10px 22px;
}

.nav-item {
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  color: #606266;
  font-size: 14px;
  margin-bottom: 4px;
  user-select: none;
}

.nav-item:hover {
  background: #f5f6f8;
}

.nav-item.active {
  background: #ecf5ff;
  color: #409eff;
  font-weight: 600;
}

.sidebar-footer {
  margin-top: auto;
  padding: 0 10px;
  color: #c0c4cc;
  font-size: 12px;
}

.content {
  flex: 1;
  min-width: 0;
}
</style>
