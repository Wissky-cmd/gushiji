<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { Category, RecordType } from '../../../shared/types'

const props = defineProps<{ visible: boolean }>()

// 可选图标（内置常用表情）
const ICONS = [
  '🍜', '🚇', '🛒', '🏠', '🎮', '💊', '📚', '🧧', '📦',
  '💼', '🏆', '📈', '🧑‍💻', '💰', '☕', '🍰', '🎬', '✈️',
  '🚗', '🚌', '🛵', '📱', '👕', '💄', '🏥', '🎓', '🎁',
  '🐶', '💡', '🔧', '🎵', '🏀', '🌱', '🍺', '🎣', '🎹'
]

const type = ref<RecordType>('expense')
const categories = ref<Category[]>([])
const loading = ref(false)

async function refresh(): Promise<void> {
  loading.value = true
  try {
    categories.value = await window.api.getCategories(type.value)
  } catch (err) {
    ElMessage.error('读取分类失败：' + (err instanceof Error ? err.message : String(err)))
  } finally {
    loading.value = false
  }
}

// 切换到本页、切换收支类型时刷新
watch(
  () => props.visible,
  (v) => {
    if (v) refresh()
  }
)
watch(type, refresh)
onMounted(refresh)

const groups = computed(() => categories.value.filter((c) => c.parentId === null))
function childrenOf(parentId: number): Category[] {
  return categories.value.filter((c) => c.parentId === parentId)
}

// 添加/编辑弹窗
const dialog = reactive({
  visible: false,
  mode: 'create' as 'create' | 'edit',
  isGroup: true, // true=一级分类，false=二级分类
  category: null as Category | null,
  parentId: null as number | null
})
const form = reactive({ name: '', icon: '' })
const saving = ref(false)

const dialogTitle = computed(() => {
  const kind = dialog.isGroup ? '大类' : '小类'
  return (dialog.mode === 'create' ? '添加' : '编辑') + kind
})

function openCreateGroup(): void {
  dialog.mode = 'create'
  dialog.isGroup = true
  dialog.category = null
  dialog.parentId = null
  form.name = ''
  form.icon = ICONS[0]
  dialog.visible = true
}

function openCreateChild(parent: Category): void {
  dialog.mode = 'create'
  dialog.isGroup = false
  dialog.category = null
  dialog.parentId = parent.id
  form.name = ''
  dialog.visible = true
}

function openEdit(cat: Category): void {
  dialog.mode = 'edit'
  dialog.isGroup = cat.parentId === null
  dialog.category = cat
  dialog.parentId = cat.parentId
  form.name = cat.name
  form.icon = cat.icon
  dialog.visible = true
}

async function save(): Promise<void> {
  const name = form.name.trim()
  if (!name) {
    ElMessage.warning('请输入分类名称')
    return
  }
  saving.value = true
  try {
    if (dialog.mode === 'create') {
      await window.api.createCategory({
        type: type.value,
        parentId: dialog.parentId,
        name,
        icon: dialog.isGroup ? form.icon : undefined
      })
      ElMessage.success('添加成功')
    } else {
      await window.api.updateCategory(
        dialog.category!.id,
        name,
        dialog.isGroup ? form.icon : undefined
      )
      ElMessage.success('修改成功')
    }
    dialog.visible = false
    await refresh()
  } catch (err) {
    ElMessage.error('保存失败：' + (err instanceof Error ? err.message : String(err)))
  } finally {
    saving.value = false
  }
}

async function remove(cat: Category): Promise<void> {
  try {
    await window.api.deleteCategory(cat.id)
    ElMessage.success('删除成功')
    await refresh()
  } catch (err) {
    ElMessage.error('删除失败：' + (err instanceof Error ? err.message : String(err)))
  }
}

async function move(cat: Category, direction: 'up' | 'down'): Promise<void> {
  try {
    await window.api.moveCategory(cat.id, direction)
    await refresh()
  } catch (err) {
    ElMessage.error('移动失败：' + (err instanceof Error ? err.message : String(err)))
  }
}
</script>

<template>
  <div v-loading="loading" class="cats">
    <header class="toolbar">
      <span class="title">分类管理</span>
      <el-radio-group v-model="type">
        <el-radio-button value="expense">支出分类</el-radio-button>
        <el-radio-button value="income">收入分类</el-radio-button>
      </el-radio-group>
      <span class="spacer" />
      <el-button type="primary" @click="openCreateGroup">＋ 添加大类</el-button>
    </header>

    <main class="groups">
      <div v-for="g in groups" :key="g.id" class="group">
        <div class="group-head">
          <span class="g-icon">{{ g.icon }}</span>
          <span class="g-name">{{ g.name }}</span>
          <span class="g-count">{{ childrenOf(g.id).length }} 个小类</span>
          <span class="spacer" />
          <el-button link @click="move(g, 'up')">↑</el-button>
          <el-button link @click="move(g, 'down')">↓</el-button>
          <el-button link @click="openEdit(g)">✏️ 编辑</el-button>
          <el-popconfirm
            :title="`确定删除「${g.name}」吗？`"
            confirm-button-text="删除"
            cancel-button-text="取消"
            confirm-button-type="danger"
            @confirm="remove(g)"
          >
            <template #reference>
              <el-button link type="danger">🗑️ 删除</el-button>
            </template>
          </el-popconfirm>
          <el-button link type="primary" @click="openCreateChild(g)">＋ 添加小类</el-button>
        </div>
        <div class="children">
          <div v-for="c in childrenOf(g.id)" :key="c.id" class="child">
            <span class="c-name">{{ c.name }}</span>
            <span class="spacer" />
            <el-button link @click="move(c, 'up')">↑</el-button>
            <el-button link @click="move(c, 'down')">↓</el-button>
            <el-button link @click="openEdit(c)">✏️</el-button>
            <el-popconfirm
              :title="`确定删除「${c.name}」吗？`"
              confirm-button-text="删除"
              cancel-button-text="取消"
              confirm-button-type="danger"
              @confirm="remove(c)"
            >
              <template #reference>
                <el-button link type="danger">🗑️</el-button>
              </template>
            </el-popconfirm>
          </div>
          <div v-if="childrenOf(g.id).length === 0" class="empty-tip">
            还没有小类，点右上角「＋ 添加小类」
          </div>
        </div>
      </div>
    </main>

    <el-dialog
      v-model="dialog.visible"
      :title="dialogTitle"
      width="400px"
      :close-on-click-modal="false"
    >
      <el-form label-position="top">
        <el-form-item v-if="dialog.isGroup" label="图标">
          <div class="icon-grid">
            <div
              v-for="ic in ICONS"
              :key="ic"
              class="icon-cell"
              :class="{ selected: form.icon === ic }"
              @click="form.icon = ic"
            >
              {{ ic }}
            </div>
          </div>
        </el-form-item>
        <el-form-item label="名称">
          <el-input v-model="form.name" placeholder="例如：宠物" maxlength="10" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.cats {
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

.spacer {
  flex: 1;
}

.groups {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px 24px;
}

.group {
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  margin-bottom: 14px;
  padding: 12px 16px;
}

.group-head {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-bottom: 10px;
  border-bottom: 1px solid #f0f2f5;
}

.g-icon {
  font-size: 18px;
  margin-right: 4px;
}

.g-name {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.g-count {
  font-size: 12px;
  color: #c0c4cc;
  margin-left: 8px;
}

.children {
  padding-top: 6px;
}

.child {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-radius: 6px;
}

.child:hover {
  background: #f8f9fb;
}

.c-name {
  font-size: 13px;
  color: #606266;
  margin-left: 26px;
}

.empty-tip {
  padding: 10px 8px;
  font-size: 12px;
  color: #c0c4cc;
  margin-left: 26px;
}

.icon-grid {
  display: grid;
  grid-template-columns: repeat(9, 1fr);
  gap: 6px;
}

.icon-cell {
  font-size: 18px;
  text-align: center;
  padding: 6px 0;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid transparent;
}

.icon-cell:hover {
  background: #f5f6f8;
}

.icon-cell.selected {
  border-color: #409eff;
  background: #ecf5ff;
}
</style>
