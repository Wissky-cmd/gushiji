<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import type { Category, RecordItem, RecordType } from '../../../shared/types'

const props = defineProps<{
  visible: boolean
  record: RecordItem | null
  categories: { expense: Category[]; income: Category[] }
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'saved'): void
  (e: 'deleted'): void
}>()

const form = reactive({
  type: 'expense' as RecordType,
  amount: null as number | null,
  categoryPath: [] as number[],
  date: dayjs().format('YYYY-MM-DD'),
  note: ''
})

const saving = ref(false)

// 当前收支类型下的分类树（一级 → 二级）
interface CategoryTree {
  value: number
  label: string
  children: { value: number; label: string }[]
}

const tree = computed<CategoryTree[]>(() => {
  const list = props.categories[form.type]
  return list
    .filter((c) => c.parentId === null)
    .map((p) => ({
      value: p.id,
      label: `${p.icon} ${p.name}`,
      children: list
        .filter((c) => c.parentId === p.id)
        .map((c) => ({ value: c.id, label: c.name }))
    }))
})

// 打开弹窗时初始化表单
watch(
  () => props.visible,
  (v) => {
    if (!v) return
    const r = props.record
    if (r) {
      form.type = r.type
      form.amount = r.amountCents / 100
      form.date = r.date
      form.note = r.note
      const child = props.categories[r.type].find((c) => c.id === r.categoryId)
      form.categoryPath = child?.parentId ? [child.parentId, r.categoryId] : []
    } else {
      form.type = 'expense'
      form.amount = null
      form.categoryPath = []
      form.date = dayjs().format('YYYY-MM-DD')
      form.note = ''
    }
  }
)

// 切换收支类型时清空已选分类（支出与收入的分类不同）
watch(
  () => form.type,
  () => {
    form.categoryPath = []
  }
)

function close(): void {
  emit('update:visible', false)
}

async function save(): Promise<void> {
  if (form.amount === null || form.amount <= 0) {
    ElMessage.warning('请输入金额')
    return
  }
  if (form.categoryPath.length !== 2) {
    ElMessage.warning('请选择分类（两级都要选）')
    return
  }
  saving.value = true
  try {
    const input = {
      type: form.type,
      amountCents: Math.round(form.amount * 100),
      categoryId: form.categoryPath[1],
      date: form.date,
      note: form.note.trim()
    }
    if (props.record) {
      await window.api.updateRecord(props.record.id, input)
      ElMessage.success('修改成功')
    } else {
      await window.api.createRecord(input)
      ElMessage.success('记账成功 🎉')
    }
    emit('saved')
  } catch (err) {
    ElMessage.error('保存失败：' + (err instanceof Error ? err.message : String(err)))
  } finally {
    saving.value = false
  }
}

async function remove(): Promise<void> {
  if (!props.record) return
  saving.value = true
  try {
    await window.api.deleteRecord(props.record.id)
    ElMessage.success('删除成功')
    emit('deleted')
  } catch (err) {
    ElMessage.error('删除失败：' + (err instanceof Error ? err.message : String(err)))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    :title="record ? '编辑账目' : '记一笔'"
    width="420px"
    :close-on-click-modal="false"
    @update:model-value="close"
  >
    <el-form label-position="top">
      <el-form-item label="类型">
        <el-radio-group v-model="form.type">
          <el-radio-button value="expense">支出</el-radio-button>
          <el-radio-button value="income">收入</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="金额（元）">
        <el-input-number
          v-model="form.amount"
          :precision="2"
          :min="0.01"
          :max="9999999.99"
          :controls="false"
          placeholder="0.00"
          style="width: 100%"
        >
          <template #prefix>¥</template>
        </el-input-number>
      </el-form-item>
      <el-form-item label="分类">
        <el-cascader
          v-model="form.categoryPath"
          :options="tree"
          :props="{ value: 'value', label: 'label', children: 'children' }"
          placeholder="请选择分类"
          clearable
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="日期">
        <el-date-picker
          v-model="form.date"
          type="date"
          value-format="YYYY-MM-DD"
          :clearable="false"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="备注（可选）">
        <el-input
          v-model="form.note"
          placeholder="例如：和同事聚餐"
          maxlength="100"
          show-word-limit
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <div class="footer">
        <el-popconfirm
          v-if="record"
          title="确定删除这条账目吗？"
          confirm-button-text="删除"
          cancel-button-text="取消"
          confirm-button-type="danger"
          @confirm="remove"
        >
          <template #reference>
            <el-button type="danger" plain :loading="saving">删除</el-button>
          </template>
        </el-popconfirm>
        <span class="spacer" />
        <el-button @click="close">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.footer {
  display: flex;
  align-items: center;
}

.spacer {
  flex: 1;
}
</style>
