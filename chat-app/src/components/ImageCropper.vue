<template>
  <div v-if="show" class="cropper-modal-overlay" @click.self="handleCancel">
    <div class="cropper-modal-content">
      <div class="cropper-modal-header">
        <h3>裁剪头像</h3>
        <button class="modal-close-btn" @click="handleCancel">×</button>
      </div>
      <div class="cropper-modal-body">
        <div class="cropper-container">
          <img ref="imageRef" :src="imageSrc" alt="裁剪图片" />
        </div>
      </div>
      <div class="cropper-modal-footer">
        <button @click="handleCancel" class="modal-btn cancel-btn">取消</button>
        <button @click="handleConfirm" class="modal-btn confirm-btn">确认</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onUnmounted, nextTick } from 'vue'
import Cropper from 'cropperjs'
import 'cropperjs/dist/cropper.css'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  imageSrc: {
    type: String,
    required: true
  }
})

const emits = defineEmits(['confirm', 'cancel'])

const imageRef = ref(null)
let cropper = null

const createCropper = () => {
  const imageEl = imageRef.value
  if (!imageEl) return

  destroyCropper()

  cropper = new Cropper(imageEl, {
    aspectRatio: NaN, // 允许自由调整长宽
    viewMode: 1,
    dragMode: 'move',
    background: false,
    autoCropArea: 0.85,
    guides: true,
    center: true,
    highlight: true,
    movable: true,
    zoomable: true,
    cropBoxMovable: true,
    cropBoxResizable: true,
    toggleDragModeOnDblclick: false,
    responsive: true,
    minCropBoxWidth: 80,
    minCropBoxHeight: 80
  })
}

const setupCropper = async () => {
  if (!props.show) return
  await nextTick()
  const imageEl = imageRef.value
  if (!imageEl) return

  if (imageEl.complete && imageEl.naturalWidth > 0) {
    createCropper()
  } else {
    imageEl.onload = () => {
      imageEl.onload = null
      createCropper()
    }
  }
}

const destroyCropper = () => {
  if (cropper) {
    cropper.destroy()
    cropper = null
  }
}

watch(
  () => props.show,
  (visible) => {
    if (visible) {
      setupCropper()
    } else {
      destroyCropper()
    }
  }
)

watch(
  () => props.imageSrc,
  (val) => {
    if (val && props.show) {
      setupCropper()
    }
  }
)

const handleConfirm = () => {
  if (!cropper) {
    emits('cancel')
    return
  }

  const canvas = cropper.getCroppedCanvas({
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
    maxWidth: 800,
    maxHeight: 800
  })

  if (!canvas) {
    emits('cancel')
    return
  }

  canvas.toBlob(
    (blob) => {
      if (blob) {
        const file = new File([blob], 'avatar.jpg', { type: blob.type || 'image/png' })
        emits('confirm', file)
      } else {
        emits('cancel')
      }
    },
    'image/jpeg',
    0.9
  )
}

const handleCancel = () => {
  emits('cancel')
}

onUnmounted(() => {
  destroyCropper()
})
</script>

<style scoped>
.cropper-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.cropper-modal-content {
  background: #fff;
  border-radius: 12px;
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.cropper-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #e0e0e0;
}

.cropper-modal-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #333;
}

.modal-close-btn {
  background: none;
  border: none;
  font-size: 24px;
  color: #999;
  cursor: pointer;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.modal-close-btn:hover {
  background: #f0f0f0;
  color: #333;
}

.cropper-modal-body {
  padding: 20px;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 300px;
  flex: 1;
  overflow: auto;
}

.cropper-container {
  width: 100%;
  max-width: 500px;
}

.cropper-container img {
  max-width: 100%;
  height: auto;
  display: block;
}

.cropper-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid #e0e0e0;
  flex-shrink: 0;
}

.modal-btn {
  padding: 8px 20px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  font-weight: 500;
}

.cancel-btn {
  background: #f5f5f5;
  color: #666;
}

.cancel-btn:hover {
  background: #e8e8e8;
}

.confirm-btn {
  background: #409eff;
  color: #fff;
}

.confirm-btn:hover {
  background: #66b1ff;
}
</style>

