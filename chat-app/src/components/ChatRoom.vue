<template>
  <div class="chat-container">
    <!-- 侧边栏 -->
    <div class="sidebar" @click="closeChatContextMenu" @contextmenu.prevent="closeChatContextMenu">
      <div class="user-info">
        <div 
          class="avatar avatar-clickable"
          @click="selectAvatar"
          :style="user.avatar ? { backgroundImage: `url(${getImageUrl(user.avatar)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}"
          :title="'点击修改头像'"
        >
          <span v-if="!user.avatar">{{ user.name?.charAt(0) || 'U' }}</span>
          <div class="avatar-edit-icon"></div>
        </div>
        <div class="user-info-text">
          <div 
            class="user-name user-name-editable"
            @click="openNicknameDialog"
            :title="'点击修改昵称'"
          >
            {{ user.name || user.username }}
          </div>
          <div 
            class="user-username user-username-editable"
            @click="openUsernameDialog"
            :title="'点击修改用户名'"
          >
            用户名：{{ user.username }}
          </div>
        </div>
        <input 
          ref="avatarInput"
          type="file"
          style="display: none"
          @change="handleAvatarSelect"
          accept="image/*"
        />
      </div>
      <div class="tabs">
        <button 
          :class="['tab', { active: currentTab === 'chat' }]"
          @click="currentTab = 'chat'; rightPanelView = 'chat'; selectedFriendId = null; selectedGroupId = null"
        >
          聊天
        </button>
        <button 
          :class="['tab', { active: currentTab === 'contact' }]"
          @click="handleContactTabClick"
        >
          通讯录
        </button>
        <button 
          :class="['tab', { active: currentTab === 'favorites' }]"
          @click="currentTab = 'favorites'; rightPanelView = 'chat'; selectedFriendId = null; selectedGroupId = null"
        >
          收藏夹
        </button>
      </div>
      <button class="tab settings-btn" @click="showSettingsModal = true">设置</button>
      <button class="logout-btn" @click="logout">退出登录</button>
    </div>

    <!-- 列表区域 -->
    <div class="list-area">
      <div class="list-header">
        <input 
          v-model="searchKeyword" 
          placeholder="搜索..."
          class="search-input"
        />
        <button v-if="currentTab === 'contact'" @click="showAddFriend = true" class="add-btn">+ 添加好友/群聊</button>
        <button v-if="currentTab === 'chat'" @click="showCreateGroupModal = true" class="create-group-btn" title="发起群聊">发起群聊</button>
      </div>
      <div class="list-content" @click="closeChatContextMenu" @contextmenu.prevent="handleListContentContextMenu">
        <!-- 收藏夹分类按钮 -->
        <div v-if="currentTab === 'favorites'" class="favorites-categories">
          <button 
            :class="['favorite-category-btn', { active: favoriteCategory === 'all' }]"
            @click="favoriteCategory = 'all'"
          >
            全部收藏
          </button>
          <button 
            :class="['favorite-category-btn', { active: favoriteCategory === 'image' }]"
            @click="favoriteCategory = 'image'"
          >
            图片
          </button>
          <button 
            :class="['favorite-category-btn', { active: favoriteCategory === 'file' }]"
            @click="favoriteCategory = 'file'"
          >
            文件
          </button>
          <button 
            :class="['favorite-category-btn', { active: favoriteCategory === 'message' }]"
            @click="favoriteCategory = 'message'"
          >
            聊天记录
          </button>
        </div>
        <div v-if="currentTab === 'chat'" class="chat-list">
          <!-- 如果没有AI好友，显示创建入口 -->
          <div v-if="!hasAIFriend && !searchKeyword" class="ai-friend-entry" @click="handleAIFriendClick">
            <div class="avatar-small ai-friend-avatar">
              <span>🤖</span>
            </div>
            <div class="chat-info">
              <div class="chat-name">AI好友</div>
              <div class="chat-preview">点击创建你的AI好朋友</div>
            </div>
          </div>
          
          <div v-if="filteredChatList.length === 0 && searchKeyword" class="empty-search">
            <div class="empty-text">未找到匹配的聊天</div>
          </div>
          <!-- 置顶聊天区域 -->
          <div v-if="filteredPinnedChatList.length > 0" class="pinned-chats-section">
            <div 
              v-for="item in filteredPinnedChatList" 
              :key="item.room"
              :class="['chat-item', 'pinned-chat-item', { active: currentRoom === item.room }]"
              @click="selectChat(item)"
              @contextmenu.prevent="openChatContextMenu($event, item)"
            >
              <div 
                class="avatar-small"
                :class="{ 'ai-friend-avatar': item.chat_type === 'ai_friend' || item.type === 'ai_friend' }"
                :style="item.avatar && (item.chat_type !== 'ai_friend' && item.type !== 'ai_friend') ? { backgroundImage: `url(${getImageUrl(item.avatar)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}"
              >
                <span v-if="item.chat_type === 'ai_friend' || item.type === 'ai_friend'">🤖</span>
                <span v-else-if="!item.avatar">{{ item.name?.charAt(0) || 'U' }}</span>
              </div>
              <div class="chat-info">
                <div class="chat-name">
                  {{ item.name }}
                  <span v-if="searchKeyword && getMatchField(item)" class="match-field">
                    {{ getMatchField(item) }}
                  </span>
                </div>
                <div class="chat-preview" v-html="formatChatPreview(item)"></div>
              </div>
              <div class="chat-meta">
                <div v-if="item.updated_at" class="chat-time">{{ formatRequestTime(item.updated_at) }}</div>
                <div class="chat-meta-icons">
                  <img 
                    v-if="item.is_muted === 1 || item.is_muted === true" 
                    :src="muteIconPath" 
                    alt="免打扰" 
                    class="mute-icon"
                  />
                  <div 
                    v-if="item.unreadCount > 0 && item.chat_type !== 'ai_friend' && item.type !== 'ai_friend'" 
                    :class="['unread-badge', { 'unread-dot': item.is_muted === 1 || item.is_muted === true }]"
                  >
                    {{ (item.is_muted === 1 || item.is_muted === true) ? '' : item.unreadCount }}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <!-- 未置顶聊天区域 -->
          <div v-if="filteredUnpinnedChatList.length > 0" class="unpinned-chats-section">
            <div 
              v-for="item in filteredUnpinnedChatList" 
              :key="item.room"
              :class="['chat-item', { active: currentRoom === item.room }]"
              @click="selectChat(item)"
              @contextmenu.prevent="openChatContextMenu($event, item)"
            >
              <div 
                class="avatar-small"
                :class="{ 'ai-friend-avatar': item.chat_type === 'ai_friend' || item.type === 'ai_friend' }"
                :style="item.avatar && (item.chat_type !== 'ai_friend' && item.type !== 'ai_friend') ? { backgroundImage: `url(${getImageUrl(item.avatar)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}"
              >
                <span v-if="item.chat_type === 'ai_friend' || item.type === 'ai_friend'">🤖</span>
                <span v-else-if="!item.avatar">{{ item.name?.charAt(0) || 'U' }}</span>
              </div>
              <div class="chat-info">
                <div class="chat-name">
                  {{ item.name }}
                  <span v-if="searchKeyword && getMatchField(item)" class="match-field">
                    {{ getMatchField(item) }}
                  </span>
                </div>
                <div class="chat-preview" v-html="formatChatPreview(item)"></div>
              </div>
              <div class="chat-meta">
                <div v-if="item.updated_at" class="chat-time">{{ formatRequestTime(item.updated_at) }}</div>
                <div class="chat-meta-icons">
                  <img 
                    v-if="item.is_muted === 1 || item.is_muted === true" 
                    :src="muteIconPath" 
                    alt="免打扰" 
                    class="mute-icon"
                  />
                  <div 
                    v-if="item.unreadCount > 0 && item.chat_type !== 'ai_friend' && item.type !== 'ai_friend'" 
                    :class="['unread-badge', { 'unread-dot': item.is_muted === 1 || item.is_muted === true }]"
                  >
                    {{ (item.is_muted === 1 || item.is_muted === true) ? '' : item.unreadCount }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- 聊天列表右键菜单 -->
        <div 
          v-if="showChatContextMenu && currentTab === 'chat'" 
          class="context-menu"
          :style="{ left: chatContextMenuPosition.x + 'px', top: chatContextMenuPosition.y + 'px' }"
          @click.stop
        >
          <div 
            v-if="selectedChatItem && (selectedChatItem.is_pinned !== 1 && selectedChatItem.is_pinned !== true)"
            class="context-menu-item"
            @click="handlePinChat"
          >
            置顶聊天
          </div>
          <div 
            v-if="selectedChatItem && (selectedChatItem.is_pinned === 1 || selectedChatItem.is_pinned === true)"
            class="context-menu-item"
            @click="handleUnpinChat"
          >
            取消置顶
          </div>
          <div 
            v-if="selectedChatItem && (selectedChatItem.is_muted !== 1 && selectedChatItem.is_muted !== true)"
            class="context-menu-item"
            @click="handleMuteChat"
          >
            消息免打扰
          </div>
          <div 
            v-if="selectedChatItem && (selectedChatItem.is_muted === 1 || selectedChatItem.is_muted === true)"
            class="context-menu-item"
            @click="handleUnmuteChat"
          >
            允许消息通知
          </div>
          <div 
            v-if="selectedChatItem && isDisbandedGroupChat(selectedChatItem)"
            class="context-menu-item context-menu-item-danger"
            @click="handleDeleteChat"
          >
            删除
          </div>
        </div>
        <div v-if="currentTab === 'contact'" class="contact-list">
          <div v-if="filteredFriendList.length === 0 && searchKeyword" class="empty-search">
            <div class="empty-text">未找到匹配的好友</div>
          </div>
          <!-- 好友推荐 -->
          <div v-if="friendRecommendations.length > 0 && !searchKeyword" class="friend-recommendations-section">
            <div class="group-name">
              你可能想认识的人
              <span v-if="hasAIRecommendation" class="ai-badge" title="由AI智能推荐">🤖 AI推荐</span>
              <span v-else class="score-badge" title="基于评分推荐">📊 评分推荐</span>
            </div>
            <div 
              v-for="recommendation in friendRecommendations" 
              :key="recommendation.user_id"
              class="friend-item friend-recommendation-item"
              @click="showUserInfoInRightPanelFromRecommendation(recommendation)"
            >
              <div 
                class="avatar-small"
                :style="recommendation.avatar ? { backgroundImage: `url(${getImageUrl(recommendation.avatar)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}"
              >
                <span v-if="!recommendation.avatar">{{ (recommendation.name || recommendation.username || 'U')?.charAt(0) }}</span>
              </div>
              <div class="friend-name">
                {{ recommendation.name || recommendation.username }}
                <div class="recommendation-reason">
                  <span v-if="recommendation.common_interests > 0" class="reason-tag">共同兴趣</span>
                  <span v-if="recommendation.common_groups > 0" class="reason-tag">共同群聊</span>
                  <span 
                    v-if="recommendation.recommended_by_ai" 
                    class="reason-tag ai-tag clickable"
                    @click.stop="showAIRecommendationReason(recommendation)"
                    title="点击查看AI推荐原因"
                  >
                    🤖 AI推荐
                  </span>
                </div>
              </div>
              <div class="friend-request-actions">
                <button 
                  class="btn primary small"
                  @click.stop="sendFriendRequestFromRecommendation(recommendation)"
                >添加</button>
              </div>
            </div>
          </div>
          <div v-if="filteredReceivedFriendRequests.length > 0" class="friend-requests-section">
            <div class="group-name">申请好友的用户（{{ filteredReceivedFriendRequests.length }}）</div>
            <div 
              v-for="request in filteredReceivedFriendRequests" 
              :key="request.id" 
              class="friend-item friend-request-entry"
            >
              <div 
                class="avatar-small"
                :style="request.sender?.avatar ? { backgroundImage: `url(${getImageUrl(request.sender.avatar)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}"
              >
                <span v-if="!request.sender?.avatar">{{ (request.sender?.name || request.sender?.username || 'U')?.charAt(0) }}</span>
              </div>
              <div class="friend-name">
                {{ request.sender?.name || request.sender?.username || '用户' }}
              </div>
              <div class="friend-request-actions">
                <button 
                  class="btn primary small"
                  @click.stop="viewFriendRequestDetail(request)"
                >查看详情</button>
              </div>
            </div>
          </div>
          <div v-if="filteredSentFriendRequests.length > 0" class="friend-requests-section">
            <div class="group-name">我的申请（{{ filteredSentFriendRequests.length }}）</div>
            <div 
              v-for="request in filteredSentFriendRequests" 
              :key="request.id" 
              class="friend-item friend-request-entry"
              @click="viewSentFriendRequestDetail(request)"
            >
              <div 
                class="avatar-small"
                :style="request.receiver?.avatar ? { backgroundImage: `url(${getImageUrl(request.receiver.avatar)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}"
              >
                <span v-if="!request.receiver?.avatar">{{ (request.receiver?.name || request.receiver?.username || 'U')?.charAt(0) }}</span>
              </div>
              <div class="friend-name">
                {{ request.receiver?.name || request.receiver?.username || '用户' }}
              </div>
              <div class="friend-request-actions waiting">
                <span class="status-text">等待对方确认</span>
              </div>
            </div>
          </div>
          <div 
            v-for="group in filteredFriendList" 
            :key="group.name"
            class="friend-group"
          >
            <div class="group-name">{{ group.name }}（{{ group.friend?.length || 0 }}）</div>
            <div 
              v-for="friend in group.friend" 
              :key="friend.id"
              :class="['friend-item', { active: selectedFriendId === friend.user_id }]"
              @click="showFriendInfoInRightPanel(friend)"
            >
              <div 
                class="avatar-small"
                :style="friend.avatar ? { backgroundImage: `url(${getImageUrl(friend.avatar)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}"
              >
                <span v-if="!friend.avatar">{{ friend.username?.charAt(0) || 'U' }}</span>
              </div>
              <div class="friend-name">
                {{ friend.remark || friend.name || friend.username }}
                <span v-if="searchKeyword && getFriendMatchField(friend)" class="match-field">
                  {{ getFriendMatchField(friend) }}
                </span>
              </div>
            </div>
          </div>
          
          <!-- 群聊列表 -->
          <div v-if="filteredGroupChatList.length > 0" class="friend-group">
            <div class="group-name">群聊（{{ filteredGroupChatList.length }}）</div>
            <div 
              v-for="groupChat in filteredGroupChatList" 
              :key="groupChat.id || groupChat.group_id || groupChat.room"
              :class="['friend-item', { active: selectedGroupId === (groupChat.id || groupChat.group_id) }]"
              @click="showGroupInfoInRightPanel(groupChat.id || groupChat.group_id)"
            >
              <div 
                class="avatar-small"
                :style="groupChat.avatar ? { backgroundImage: `url(${getImageUrl(groupChat.avatar)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}"
              >
                <span v-if="!groupChat.avatar">{{ (groupChat.name || groupChat.remark || '群')?.charAt(0) }}</span>
              </div>
              <div class="friend-name">
                {{ groupChat.remark || groupChat.name || '群聊' }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 聊天区域 -->
    <div class="chat-area" @click="closeChatContextMenu" @contextmenu.prevent="closeChatContextMenu">
      <!-- 用户信息显示 -->
      <div v-if="rightPanelView === 'userInfo'" class="right-panel-content user-info-panel">
        <div class="right-panel-header">
          <h3>用户信息</h3>
          <button v-if="currentTab !== 'contact'" class="close-btn" @click="rightPanelView = 'chat'">×</button>
        </div>
        <div class="right-panel-body user-info-body">
          <div class="user-info-avatar-large">
            <div 
              class="avatar-large avatar-clickable"
              :class="{ 'ai-friend-avatar': selectedUserInfo.isAIFriend }"
              :style="selectedUserInfo.avatar && !selectedUserInfo.isAIFriend ? { backgroundImage: `url(${getImageUrl(selectedUserInfo.avatar)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}"
              @click="selectedUserInfo.avatar && !selectedUserInfo.isAIFriend ? previewAvatar(selectedUserInfo.avatar) : null"
            >
              <span v-if="selectedUserInfo.isAIFriend">🤖</span>
              <span v-else-if="!selectedUserInfo.avatar">{{ (selectedUserInfo.name || selectedUserInfo.username || 'U')?.charAt(0) }}</span>
            </div>
          </div>
          <div class="user-info-details">
            <!-- 如果没有备注，第一行显示昵称 -->
            <div v-if="selectedUserInfo.is_friend && !selectedUserInfo.remark" class="user-info-name">
              {{ selectedUserInfo.name || selectedUserInfo.username || '用户' }}
            </div>
            <!-- 如果有备注，第一行显示备注 -->
            <div v-else-if="selectedUserInfo.is_friend && selectedUserInfo.remark" class="user-info-name">
              {{ selectedUserInfo.remark }}
            </div>
            <!-- 如果不是好友，显示昵称 -->
            <div v-else class="user-info-name">{{ selectedUserInfo.name || selectedUserInfo.username || '用户' }}</div>
            
            <!-- 如果是群聊且有群聊昵称，显示群聊昵称（最上面） -->
            <div v-if="currentChatInfo?.type === 'group' && selectedUserInfo.group_nickname && selectedUserInfo.group_nickname !== selectedUserInfo.name" class="user-info-group-nickname">群聊昵称：{{ selectedUserInfo.group_nickname }}</div>
            
            <!-- 如果有备注，显示昵称行 -->
            <div v-if="selectedUserInfo.is_friend && selectedUserInfo.remark" class="user-info-nickname">昵称：{{ selectedUserInfo.name || selectedUserInfo.username || '未知' }}</div>
            
            <!-- 用户名行 -->
            <div class="user-info-username">用户名：{{ selectedUserInfo.username || '未知' }}</div>
            
            <!-- 邮箱行 -->
            <div class="user-info-email">邮箱：{{ selectedUserInfo.email || '未知' }}</div>
            
            <!-- 个性签名行 -->
            <div class="user-info-signature" v-if="selectedUserInfo.signature">
              个性签名：{{ selectedUserInfo.signature }}
            </div>
            
            <div v-if="selectedFriendRequest" class="user-info-greeting-line">打招呼内容：{{ selectedFriendRequest.greeting || '-' }}</div>
            <div v-if="selectedFriendRequest && selectedFriendRequest.created_at" class="user-info-request-time">申请时间：{{ formatRequestTime(selectedFriendRequest.created_at) }}</div>
            
            <!-- 如果是好友，显示备注相关操作 -->
            <div v-if="selectedUserInfo.is_friend && !isEditingRemark" class="user-info-remark-hint">
            <!-- 如果有备注，显示修改备注的提示 -->
              <span v-if="selectedUserInfo.remark" class="remark-hint-text" @click="startEditRemark">修改备注名</span>
            <!-- 如果没有备注，显示添加备注的提示 -->
              <span v-else class="remark-hint-text" @click="startEditRemark">添加备注名</span>
            </div>
            <!-- 编辑备注输入框 -->
            <div v-if="selectedUserInfo.is_friend && isEditingRemark" class="remark-edit">
              <input
                v-model="editingRemark"
                @keydown.enter="saveRemark"
                @keydown.esc="cancelEditRemark"
                class="remark-input"
                placeholder="输入备注名"
                maxlength="20"
                ref="remarkInputRef"
              />
              <div class="remark-edit-buttons">
                <button @click="saveRemark" class="remark-save-btn">✓</button>
                <button @click="cancelEditRemark" class="remark-cancel-btn">✕</button>
              </div>
            </div>
            
            <!-- 兴趣爱好显示 -->
            <div v-if="selectedUserInfo.interests" class="user-info-interests">
              <div class="user-info-interests-label">兴趣爱好：</div>
              <div class="user-info-interests-tags">
                <span
                  v-for="tag in getInterestsArray(selectedUserInfo.interests)"
                  :key="tag"
                  class="user-info-interest-tag"
                >
                  {{ tag }}
                </span>
              </div>
            </div>
            
            <!-- 如果是好友且不是自己，显示拉黑/解除拉黑按钮 -->
            <div v-if="selectedUserInfo.is_friend && selectedUserInfo.id !== user.id" class="user-info-block-friend">
              <div class="user-info-divider"></div>
              <span v-if="!selectedUserInfo.is_blocked" class="block-friend-text" @click="showBlockFriendConfirm = true">拉黑</span>
              <span v-else class="block-friend-text" @click="showUnblockFriendConfirm = true">解除拉黑</span>
            </div>
            
            <!-- 如果不是好友但被拉黑且不是自己，显示解除拉黑按钮 -->
            <div v-if="!selectedUserInfo.is_friend && selectedUserInfo.is_blocked && selectedUserInfo.id !== user.id" class="user-info-block-friend">
              <div class="user-info-divider"></div>
              <span class="block-friend-text" @click="showUnblockFriendConfirm = true">解除拉黑</span>
            </div>
            
            <!-- 如果不是好友且不是查看好友申请且不是自己，显示添加好友按钮 -->
            <div v-if="!selectedUserInfo.is_friend && !selectedFriendRequest && selectedUserInfo.id !== user.id" class="user-info-add-friend">
              <button @click="addFriendFromUserInfo" class="btn primary full-width">添加好友</button>
            </div>
            
            <!-- 如果不是自己且有好友关系，显示发消息按钮 -->
            <div v-if="selectedUserInfo.id !== user.id && hasFriendRelation(selectedUserInfo.id)" class="user-info-send-message">
              <button @click="sendMessageToUser" class="btn send-message-btn full-width">发消息</button>
            </div>
            
            <!-- 如果是好友且不是自己，显示删除好友按钮 -->
            <div v-if="selectedUserInfo.is_friend && selectedUserInfo.id !== user.id" class="user-info-delete-friend">
              <button @click="deleteFriend" class="btn danger full-width">删除好友</button>
            </div>
          </div>
        </div>
        <div v-if="selectedFriendRequest && selectedFriendRequestIsIncoming" class="user-info-request-actions">
          <button 
            class="btn primary"
            :disabled="isProcessingRequest(selectedFriendRequest.id)"
            @click="respondFriendRequest(selectedFriendRequest, 'accept')"
          >同意申请</button>
          <button 
            class="btn danger"
            :disabled="isProcessingRequest(selectedFriendRequest.id)"
            @click="respondFriendRequest(selectedFriendRequest, 'reject')"
          >拒绝申请</button>
        </div>
      </div>
      
      <!-- 群聊信息显示 -->
      <div v-else-if="rightPanelView === 'groupInfo'" class="right-panel-content group-info-panel">
        <div class="right-panel-header">
          <h3>群聊信息</h3>
          <button v-if="currentTab !== 'contact'" class="close-btn" @click="rightPanelView = 'chat'">×</button>
        </div>
        <div class="right-panel-body group-info-body">
          <!-- 已解散的群聊只显示查找聊天记录按钮 -->
          <template v-if="groupInfo?.is_disbanded === 1">
            <!-- 查找聊天记录按钮 -->
            <div class="form-group">
              <button @click="openSearchHistory" class="btn secondary" style="width: 100%;">查找聊天记录</button>
            </div>
          </template>
          
          <!-- 未解散的群聊显示所有内容 -->
          <template v-else>
            <!-- 群名称和群id显示 -->
            <div class="form-group group-info-header">
              <div class="group-info-title">
                <div class="group-name-display">群名称：{{ groupInfo.name || getDefaultGroupName() }}</div>
                <div v-if="groupInfo.group_code" class="group-id-display">群id：{{ groupInfo.group_code }}</div>
              </div>
            </div>
            
            <!-- 第一行：搜索群成员 -->
            <div class="form-group">
              <input 
                v-model="groupMemberSearchKeyword" 
                placeholder="搜索群成员"
                class="modal-input"
                @input="filterGroupMembers"
              />
            </div>
            
            <!-- 第二行：群成员列表 -->
            <div class="form-group">
              <label>群成员（{{ filteredGroupMembers.length }}）</label>
              <div class="group-members-grid">
                <div 
                  v-for="member in filteredGroupMembers" 
                  :key="member.user_id"
                  class="group-member-item"
                >
                  <div 
                    class="group-member-avatar avatar-clickable"
                    :style="member.avatar ? { backgroundImage: `url(${getImageUrl(member.avatar)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}"
                    @click="currentTab === 'contact' ? showUserInfo(member.user_id, member.avatar, getMemberDisplayName(member)) : showUserInfoInRightPanelFromMember(member)"
                  >
                    <span v-if="!member.avatar">{{ getMemberDisplayName(member).charAt(0) }}</span>
                  </div>
                  <div class="group-member-info">
                    <div class="group-member-name">{{ getMemberDisplayName(member) }}</div>
                    <!-- 如果匹配字段的值与显示名称不同，显示匹配字段信息 -->
                    <div 
                      v-if="member.matchField && member.matchField.value !== getMemberDisplayName(member)" 
                      class="group-member-match-field"
                    >
                      {{ getMatchFieldLabel(member.matchField) }}
                    </div>
                    <!-- 如果是群主，显示"群主"标识 -->
                    <div 
                      v-if="groupInfo && groupInfo.creator_id === member.user_id" 
                      class="group-member-owner"
                    >
                      群主
                    </div>
                    <!-- 如果是管理员，显示"管理员"标识 -->
                    <div 
                      v-else-if="isAdmin(member.user_id)" 
                      class="group-member-admin"
                    >
                      管理员
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- 第三行：添加按钮 -->
            <div class="form-group">
              <button @click="openAddGroupMemberModal" class="btn primary" style="width: 100%;">添加成员</button>
            </div>
            
            <!-- 第三行半：移除成员按钮（仅群主和管理员可见） -->
            <div v-if="canRemoveMembers" class="form-group">
              <button @click="openRemoveGroupMemberModal" class="btn secondary" style="width: 100%;">移除成员</button>
            </div>
            
            <!-- 第四行：群聊头像 -->
            <div class="form-group">
              <label>群聊头像</label>
              <div class="group-info-avatar-section">
                <div 
                  class="group-info-avatar avatar-clickable"
                  :style="groupInfo.avatar ? { backgroundImage: `url(${getImageUrl(groupInfo.avatar)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}"
                  @click="groupInfo.avatar ? previewAvatar(groupInfo.avatar) : null"
                >
                  <span v-if="!groupInfo.avatar">群</span>
                </div>
                <button 
                  @click="selectGroupInfoAvatar" 
                  class="btn secondary small"
                >
                  上传头像
                </button>
                <input 
                  ref="groupInfoAvatarInput"
                  type="file"
                  style="display: none"
                  @change="handleGroupInfoAvatarSelect"
                  accept="image/*"
                />
              </div>
            </div>
            
            <!-- 第五行：群聊名称 -->
            <div class="form-group">
              <label>群聊名称</label>
              <div class="group-info-name-section">
                <div v-if="!editingGroupName" class="group-info-name-display" @click.stop="startEditGroupName">
                  {{ groupInfo.name || getDefaultGroupName() }}
                </div>
                <div v-else class="group-info-name-edit" ref="groupNameEditRef" @click.stop>
                  <input 
                    v-model="editingGroupNameValue" 
                    class="modal-input"
                    placeholder="请输入群聊名称（留空则使用默认名称）"
                    maxlength="50"
                    @keyup.enter="saveGroupName"
                    @keyup.esc="cancelEditGroupName"
                    ref="groupNameInput"
                  />
                  <div class="group-info-name-actions">
                    <button @click="saveGroupName" class="btn primary small">保存</button>
                    <button @click="cancelEditGroupName" class="btn secondary small">取消</button>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- 第六行：备注 -->
            <div class="form-group">
              <label>备注</label>
              <div class="group-info-remark-section">
                <div v-if="!editingGroupRemark" class="group-info-remark-display" @click.stop="startEditGroupRemark">
                  {{ groupRemark || '群聊的备注仅自己可见' }}
                </div>
                <div v-else class="group-info-remark-edit" ref="groupRemarkEditRef" @click.stop>
                  <input 
                    v-model="editingGroupRemarkValue" 
                    class="modal-input"
                    placeholder="请输入备注"
                    maxlength="50"
                    @keyup.enter="saveGroupRemark"
                    @keyup.esc="cancelEditGroupRemark"
                    ref="groupRemarkInput"
                  />
                  <div class="group-info-remark-actions">
                    <button @click="saveGroupRemark" class="btn primary small">保存</button>
                    <button @click="cancelEditGroupRemark" class="btn secondary small">取消</button>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- 第七行：我在本群的昵称 -->
            <div class="form-group">
              <label>我在本群的昵称</label>
              <div class="group-info-nickname-section">
                <div v-if="!editingGroupNickname" class="group-info-nickname-display" @click.stop="startEditGroupNickname">
                  {{ myGroupNickname || user?.name || user?.username || '用户' }}
                </div>
                <div v-else class="group-info-nickname-edit" ref="groupNicknameEditRef" @click.stop>
                  <input 
                    v-model="editingGroupNicknameValue" 
                    class="modal-input"
                    placeholder="请输入群昵称（留空则使用原昵称）"
                    maxlength="20"
                    @keyup.enter="saveGroupNickname"
                    @keyup.esc="cancelEditGroupNickname"
                    ref="groupNicknameInput"
                  />
                  <div class="group-info-nickname-actions">
                    <button @click="saveGroupNickname" class="btn primary small">保存</button>
                    <button @click="cancelEditGroupNickname" class="btn secondary small">取消</button>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- 群管理按钮 -->
            <div class="form-group">
              <button @click="openGroupManagementModal" class="btn secondary" style="width: 100%;">群管理</button>
            </div>
            
            <!-- 查找聊天记录按钮 -->
            <div class="form-group">
              <button @click="openSearchHistory" class="btn secondary" style="width: 100%;">查找聊天记录</button>
            </div>
            
            <!-- 群公告按钮 -->
            <div class="form-group">
              <button @click="openAnnouncementModalFromRightPanel" class="btn secondary" style="width: 100%;">群公告</button>
            </div>
            
            <!-- 发消息按钮 -->
            <div class="form-group">
              <button @click="sendMessageToGroupFromRightPanel" class="btn send-message-btn" style="width: 100%;">发消息</button>
            </div>
            
            <!-- 退出群聊按钮 -->
            <div class="form-group">
              <button @click="showLeaveGroupConfirm = true" class="btn danger" style="width: 100%;">退出群聊</button>
            </div>
          </template>
        </div>
      </div>
      
      <!-- 收藏夹内容显示 -->
      <div v-else-if="currentTab === 'favorites'" class="favorites-content">
        <div class="favorites-header">
          <h3>{{ getFavoriteCategoryTitle() }}</h3>
        </div>
        <div class="favorites-list">
          <div v-if="filteredFavorites.length === 0" class="empty-favorites">
            <div class="empty-text">暂无收藏</div>
          </div>
          <div 
            v-for="item in filteredFavorites" 
            :key="item.id"
            class="favorite-item"
          >
            <!-- 图片收藏 -->
            <div v-if="item.type === 'image'" class="favorite-image-item" @contextmenu.prevent="openFavoriteContextMenu($event, item)">
              <img :src="getImageUrl(item.content)" alt="收藏的图片" @click="previewImage(item.content)" />
              <!-- 显示来源信息 -->
              <div v-if="item.chat_title" class="favorite-item-source">
                {{ getFavoriteSourceText(item) }}
              </div>
              <div class="favorite-item-time">{{ formatFavoriteTime(item.created_at) }}</div>
            </div>
            <!-- 文件收藏 -->
            <div v-else-if="item.type === 'file'" class="favorite-file-item" @contextmenu.prevent="openFavoriteContextMenu($event, item)">
              <div class="favorite-file-header">
                <div class="favorite-file-icon">📎</div>
                <div class="favorite-file-info">
                  <div class="favorite-file-name">{{ getFileName(item.content) }}</div>
                  <div class="favorite-file-size" v-if="item.file_size">{{ item.file_size }}</div>
                </div>
                <div class="favorite-file-actions">
                  <button @click="downloadFile(item.content, 'file')" class="download-btn">下载</button>
                </div>
              </div>
              <!-- 显示来源信息 -->
              <div v-if="item.chat_title" class="favorite-item-source">
                {{ getFavoriteSourceText(item) }}
              </div>
              <div class="favorite-item-time">{{ formatFavoriteTime(item.created_at) }}</div>
            </div>
            <!-- 聊天记录收藏 -->
            <div v-else-if="item.type === 'message'" class="favorite-message-item" @contextmenu.prevent="openFavoriteContextMenu($event, item)">
              <!-- 如果是转发消息（JSON格式），显示为卡片 -->
              <div v-if="isForwardMessage(item.content)" class="forwarded-message-card" @click="showFavoriteForwardMessages(item)">
                <div class="forwarded-message-title">
                  {{ getFavoriteForwardTitle(item.content) }}
                </div>
                <div class="forwarded-message-preview">
                  {{ getFavoriteForwardPreview(item.content) }}
                </div>
              </div>
              <!-- 普通消息 -->
              <div v-else class="favorite-message-content" v-html="formatMessageContent(item.content)"></div>
              <!-- 显示来源信息（仅单条消息，非转发消息） -->
              <div v-if="!isForwardMessage(item.content) && item.chat_title" class="favorite-item-source">
                {{ getFavoriteSourceText(item) }}
              </div>
              <div class="favorite-item-time">{{ formatFavoriteTime(item.created_at) }}</div>
            </div>
            <!-- 其他类型 -->
            <div v-else class="favorite-other-item" @contextmenu.prevent="openFavoriteContextMenu($event, item)">
              <div class="favorite-other-content">{{ item.content }}</div>
              <div class="favorite-item-time">{{ formatFavoriteTime(item.created_at) }}</div>
            </div>
          </div>
        </div>
        
        <!-- 收藏项右键菜单 -->
        <div 
          v-if="showFavoriteContextMenu && currentTab === 'favorites'" 
          class="context-menu"
          :style="{ left: favoriteContextMenuPosition.x + 'px', top: favoriteContextMenuPosition.y + 'px' }"
          @click.stop
        >
          <div 
            v-if="selectedFavoriteItem && selectedFavoriteItem.type === 'file'"
            class="context-menu-item"
            @click="handleDownloadFavoriteFile"
          >
            下载
          </div>
          <div 
            v-if="selectedFavoriteItem && selectedFavoriteItem.message_id"
            class="context-menu-item"
            @click="handleForwardFavorite"
          >
            转发
          </div>
          <div 
            v-if="selectedFavoriteItem"
            class="context-menu-item context-menu-item-danger"
            @click="handleRemoveFavorite"
          >
            取消收藏
          </div>
        </div>
      </div>
      <div v-else-if="rightPanelView === 'chat' && !currentRoom" class="empty-chat">
        <div class="empty-text">
          <span v-if="currentTab === 'contact'">选择一个好友或群聊查看信息</span>
          <span v-else>选择一个聊天开始对话</span>
        </div>
      </div>
      <div v-else-if="rightPanelView === 'chat' && currentRoom" class="chat-room">
        <div class="chat-header">
          <div class="room-name">
            {{ currentChatInfo?.name || '聊天' }}
            <span v-if="currentChatInfo?.type === 'group' && currentChatInfo?.member_count" class="member-count">
              （{{ currentChatInfo.member_count }}）
            </span>
          </div>
          <div class="chat-header-buttons">
            <button class="search-history-btn" @click="openSearchHistory" title="查找聊天记录">
              <img src="/electron/resource/images/ChatHistory.svg" alt="查找聊天记录" class="search-history-icon" />
            </button>
            <button 
              v-if="currentChatInfo?.type === 'group'" 
              class="group-info-btn" 
              @click="openGroupInfoModal" 
              title="群聊信息"
            >
              <img src="/electron/resource/images/messageInformation.svg" alt="群聊信息" class="group-info-icon" />
            </button>
          </div>
        </div>
        <div ref="messagesContainer" class="messages-container" @click="handleMessagesContainerClick" @contextmenu.prevent="handleMessagesContainerContextMenu">
          <div 
            v-for="(msg, index) in displayMessages" 
            :key="msg.id || index"
            :data-message-id="msg.id"
            :class="['message-item', { 
              own: msg.sender_id === user.id, 
              'is-recalled': msg.is_recalled,
              'is-system': isSystemMessage(msg),
              'multi-select-mode': isMultiSelectMode && !isSystemMessage(msg) && !msg.is_recalled && !deletedMessageIds.has(msg.id),
              'selected': isMultiSelectMode && selectedMessages.has(msg.id) && !isSystemMessage(msg) && !msg.is_recalled && !deletedMessageIds.has(msg.id)
            }]"
          >
            <!-- 多选模式下的勾选框 -->
            <div v-if="isMultiSelectMode && !isSystemMessage(msg) && !msg.is_recalled && !deletedMessageIds.has(msg.id)" class="message-checkbox">
              <div 
                :class="['message-checkbox-circle', { checked: selectedMessages.has(msg.id) }]"
                @click.stop="toggleMessageSelection(msg.id)"
              >
                <span v-if="selectedMessages.has(msg.id)">✓</span>
              </div>
            </div>
            <!-- 系统通知消息（包括系统通知和撤回消息） -->
            <div v-if="isSystemMessage(msg)" class="system-notification">
              <span class="system-notification-content" v-html="getSystemNotificationText(msg)"></span>
              <span class="system-notification-time">{{ formatMessageTime(msg.created_at) }}</span>
            </div>
            <!-- 普通消息 -->
            <template v-else>
              <div 
                class="message-avatar avatar-clickable"
                :class="{ 'ai-friend-avatar': getMessageAvatarStyle(msg) === 'AI_FRIEND_AVATAR' }"
                :style="getMessageAvatarStyle(msg) && getMessageAvatarStyle(msg) !== 'AI_FRIEND_AVATAR' ? { backgroundImage: `url(${getImageUrl(getMessageAvatarStyle(msg))})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}"
                @click="showUserInfo(msg.sender_id, msg.avatar, msg.nickname)"
              >
                <span v-if="getMessageAvatarStyle(msg) === 'AI_FRIEND_AVATAR'">🤖</span>
                <span v-else-if="!getMessageAvatarStyle(msg)">{{ msg.nickname?.charAt(0) || 'U' }}</span>
              </div>
              <div class="message-content" @contextmenu.stop="!isSystemMessage(msg) ? showMessageContextMenu($event, msg) : null">
                <div v-if="currentChatInfo?.type === 'group' && msg.sender_id !== user.id" class="message-sender">{{ msg.nickname || '用户' }}</div>
                <!-- 正常消息 -->
                <div class="message-bubble-wrapper">
                  <!-- 红色圆圈和感叹号（仅自己发送的消息且需要验证或被拉黑时显示） -->
                  <div v-if="msg.sender_id === user.id && (msg.requires_verification || msg.is_blocked)" class="verification-warning">
                    <div class="verification-icon">!</div>
                  </div>
                  <!-- 多选转发消息 -->
                  <div v-if="msg.media_type === 'forward_multiple' || (msg.forward_info && msg.forward_info.messages)" class="forwarded-message-card" @click="showForwardMessagesModal(msg)">
                    <div class="forwarded-message-title">
                      {{ getForwardMessageTitle(msg) }}
                    </div>
                    <div class="forwarded-message-preview">
                      {{ getForwardMessagePreview(msg) }}
                    </div>
                  </div>
                  <!-- 普通消息 -->
                  <template v-else>
                    <div v-if="msg.type === 'text' || msg.media_type === 'text'" class="message-text" v-html="formatMessageContent(msg.content)"></div>
                    <div v-else-if="msg.type === 'image'" class="message-image">
                      <img :src="getImageUrl(msg.content)" alt="图片" @click="previewImage(msg.content)" />
                    </div>
                    <div v-else-if="msg.type === 'file'" class="message-file">
                      <div class="file-link" @click="downloadFile(msg.content, msg.type)">📎 {{ getFileName(msg.content) }}</div>
                      <span v-if="msg.file_size" class="file-size">{{ msg.file_size }}</span>
                    </div>
                    <div v-else class="message-file">{{ msg.content }}</div>
                  </template>
                </div>
                <div class="message-time">{{ formatMessageTime(msg.created_at) }}</div>
              </div>
            </template>
          </div>
        </div>
        
        <!-- 消息右键菜单 -->
        <div 
          v-if="showContextMenu && currentRoom" 
          class="context-menu"
          :style="{ left: contextMenuPosition.x + 'px', top: contextMenuPosition.y + 'px' }"
          @click.stop
        >
          <div 
            v-if="selectedMessage && canRecallMessage(selectedMessage) && !selectedMessage.is_recalled && !deletedMessageIds.has(selectedMessage.id)"
            class="context-menu-item"
            @click="handleRecallMessage"
          >
            撤回
          </div>
          <div 
            v-if="selectedMessage && !selectedMessage.is_recalled && !deletedMessageIds.has(selectedMessage.id)"
            class="context-menu-item"
            @click="handleForwardMessage"
          >
            转发
          </div>
          <div 
            v-if="selectedMessage && !selectedMessage.is_recalled && !deletedMessageIds.has(selectedMessage.id)"
            class="context-menu-item"
            @click="handleMultiSelect"
          >
            多选
          </div>
          <div 
            v-if="selectedMessage && !selectedMessage.is_recalled && !deletedMessageIds.has(selectedMessage.id)"
            class="context-menu-item"
            @click="handleAddFavorite"
          >
            收藏
          </div>
          <div 
            v-if="selectedMessage && !selectedMessage.is_recalled && !deletedMessageIds.has(selectedMessage.id)"
            class="context-menu-item"
            @click="handleDeleteMessage"
          >
            删除
          </div>
        </div>
        <div class="chat-input-area">
          <div class="input-toolbar">
            <button @click="toggleEmojiPicker" class="tool-btn" :disabled="isGroupDisbanded" :class="{ 'disabled': isGroupDisbanded }" title="表情">
              <img :src="expressionIconPath" alt="表情" style="width: 20px; height: 20px; vertical-align: middle;" />
            </button>
            <button @click="selectFile" class="tool-btn" :disabled="isGroupDisbanded" :class="{ 'disabled': isGroupDisbanded }" title="选择文件">
              <img :src="fileIconPath" alt="选择文件" style="width: 20px; height: 20px; vertical-align: middle;" />
            </button>
            <button @click="selectImage" class="tool-btn" :disabled="isGroupDisbanded" :class="{ 'disabled': isGroupDisbanded }" title="选择图片">
              <img :src="imageIconPath" alt="选择图片" style="width: 20px; height: 20px; vertical-align: middle;" />
            </button>
            <button @click="openSelectFavoriteModal" class="tool-btn" :disabled="isGroupDisbanded" :class="{ 'disabled': isGroupDisbanded }" title="选择收藏">
              ⭐
            </button>
            <input 
              ref="fileInput"
              type="file"
              style="display: none"
              @change="handleFileSelect"
              accept="*/*"
            />
            <input 
              ref="imageInput"
              type="file"
              style="display: none"
              @change="handleImageSelect"
              accept="image/*"
            />
          </div>
          <!-- 表情选择面板 -->
          <div v-if="showEmojiPicker" class="emoji-picker">
            <div class="emoji-categories">
              <button 
                v-for="category in emojiCategories" 
                :key="category.name"
                :class="['emoji-category-btn', { active: currentEmojiCategory === category.name }]"
                @click="currentEmojiCategory = category.name"
              >
                {{ category.icon }}
              </button>
            </div>
            <div class="emoji-list">
              <button
                v-for="emoji in getCurrentCategoryEmojis()"
                :key="emoji"
                class="emoji-item"
                @click="insertEmoji(emoji)"
                :title="emoji"
              >
                {{ emoji }}
              </button>
            </div>
          </div>
          <div class="input-row">
            <!-- 多选模式下的转发按钮 -->
            <div v-if="isMultiSelectMode" class="multi-select-actions">
              <button @click="exitMultiSelectMode" class="cancel-multi-select-btn">取消</button>
              <button 
                @click="openMultiForwardModal" 
                class="forward-multi-btn"
                :disabled="selectedMessages.size === 0"
              >
                转发({{ selectedMessages.size }})
              </button>
              <button 
                @click="handleMultiFavorite" 
                class="favorite-multi-btn"
                :disabled="selectedMessages.size === 0"
              >
                收藏({{ selectedMessages.size }})
              </button>
            </div>
            <!-- 正常输入模式 -->
            <template v-else>
              <div class="input-wrapper" style="position: relative; flex: 1;">
                <textarea 
                  v-model="inputMessage" 
                  @keydown.enter.exact="handleEnterKey"
                  @keydown="handleInputKeydown"
                  @input="handleInputChange"
                  @click="showEmojiPicker = false"
                  :placeholder="isGroupDisbanded ? '无法在已解散的群聊中发送消息' : '输入消息...'"
                  :disabled="isGroupDisbanded"
                  :class="['message-input', { 'disabled': isGroupDisbanded }]"
                  rows="1"
                  ref="messageInputRef"
                ></textarea>
              <!-- @选择器 -->
              <div 
                v-if="showMentionPicker && currentChatInfo?.type === 'group'" 
                class="mention-picker" 
                :style="mentionPickerStyle"
              >
                <div
                  v-for="(item, index) in mentionPickerItems"
                  :key="index"
                  :class="['mention-item', { active: mentionPickerSelectedIndex === index }]"
                  @click="selectMention(item)"
                  @mouseenter="mentionPickerSelectedIndex = index"
                >
                  <div
                    v-if="item.type === 'all'"
                    class="mention-avatar"
                    :style="{ backgroundImage: `url(${allPeopleIconPath})`, backgroundSize: 'cover', backgroundPosition: 'center' }"
                  >
                  </div>
                  <div
                    v-else
                    class="mention-avatar"
                    :style="item.avatar ? { backgroundImage: `url(${getImageUrl(item.avatar)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}"
                  >
                    <span v-if="!item.avatar">{{ item.displayName?.charAt(0) || 'U' }}</span>
                  </div>
                  <div class="mention-name">{{ item.displayName }}</div>
                </div>
              </div>
            </div>
            <button @click="sendMessage" class="send-btn" :disabled="isGroupDisbanded">发送</button>
            </template>
          </div>
          <!-- 推荐回复 -->
          <div v-if="suggestedReplies.length > 0 && !isMultiSelectMode && currentRoom" class="suggested-replies">
            <div class="suggested-replies-header">
              <div class="suggested-replies-label">💡 推荐回复：</div>
              <button class="suggested-replies-close" @click="closeSuggestedReplies" title="关闭">×</button>
            </div>
            <div class="suggested-replies-list">
              <button
                v-for="(reply, index) in suggestedReplies"
                :key="index"
                class="suggested-reply-btn"
                @click="useSuggestedReply(reply)"
                :disabled="isGroupDisbanded"
              >
                {{ reply }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 添加好友对话框 -->
    <div v-if="showAddFriend" class="modal-overlay">
      <div class="modal-content add-friend-modal">
        <div class="modal-header">
          <h3>添加好友/群聊</h3>
          <button class="modal-close-btn" @click="closeAddFriendDialog">×</button>
        </div>
        <div class="modal-body">
          <div class="search-input-row">
            <input 
              v-model="searchUsername" 
              placeholder="输入用户名或邮箱搜索/群id搜索" 
              class="search-input" 
              ref="searchUsernameInputRef"
              @keyup.enter="searchUser"
            />
            <button @click="searchUser" class="btn primary">搜索</button>
          </div>
          <div v-if="searchResults.length > 0" class="search-user-info">
            <!-- 群聊搜索结果 -->
            <template v-for="item in searchResults">
            <div 
              v-if="item.type === 'group'"
              :key="item.id"
              class="search-user-card"
            >
              <div 
                class="search-user-avatar"
                :style="item.avatar && item.avatar.trim() ? { backgroundImage: `url(${getImageUrl(item.avatar)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}"
              >
                <span v-if="!item.avatar || !item.avatar.trim()">群</span>
              </div>
              <div class="search-user-details" style="flex: 1;">
                <div class="search-user-name">{{ item.name || '群聊' }}</div>
                <div class="search-user-username">群id：{{ item.group_code || '-' }}</div>
                <div class="search-user-email">群成员：{{ item.member_count || 0 }}人</div>
                <div v-if="item.members && item.members.length > 0" class="search-group-members-section" style="margin-top: 12px;">
                  <div class="search-group-members-label" style="font-size: 13px; color: #666; margin-bottom: 8px;">群成员列表：</div>
                  <div class="group-members-grid" style="grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));">
                    <div 
                      v-for="member in item.members" 
                      :key="member.user_id"
                      class="group-member-item"
                    >
                      <div 
                        class="group-member-avatar avatar-clickable"
                        :style="member.avatar ? { backgroundImage: `url(${getImageUrl(member.avatar)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}"
                        @click.stop="showUserInfo(member.user_id, member.avatar, member.nickname)"
                      >
                        <span v-if="!member.avatar || !member.avatar.trim()">{{ (member.nickname || 'U').charAt(0) }}</span>
                      </div>
                      <div class="group-member-info">
                        <div class="group-member-name" style="font-size: 11px; text-align: center; word-break: break-all; line-height: 1.2;">{{ member.nickname }}</div>
                      </div>
                    </div>
                  </div>
                  <div v-if="item.member_count > item.members.length" style="margin-top: 8px; font-size: 12px; color: #999; text-align: center;">
                    等共{{ item.member_count }}人
                  </div>
                </div>
                <div v-if="item.created_at" class="search-group-time" style="margin-top: 8px; font-size: 12px; color: #999;">
                  创建时间：{{ formatDate(item.created_at) }}
                </div>
              </div>
              <div class="search-user-action">
                <button 
                  v-if="!item.is_member" 
                  @click="joinGroup(item)"
                  class="btn primary"
                >
                  添加群聊
                </button>
                <span v-else class="status-text">已加入</span>
              </div>
            </div>
            </template>
            <!-- 用户搜索结果 -->
            <template v-for="user in searchResults">
            <div 
              v-if="!user.type || user.type === 'user'"
              :key="user.id"
              class="search-user-card"
            >
              <div 
                class="search-user-avatar"
                :style="user.avatar ? { backgroundImage: `url(${getImageUrl(user.avatar)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}"
              >
                <span v-if="!user.avatar">{{ (user.name || user.username || 'U')?.charAt(0) }}</span>
              </div>
              <div class="search-user-details">
                <div class="search-user-name">{{ user.name || user.username || '用户' }}</div>
                <div class="search-user-username">用户名：{{ user.username || '-' }}</div>
                <div class="search-user-email">邮箱：{{ user.email || '-' }}</div>
              </div>
              <div class="search-user-action">
                <button 
                  v-if="!user.status && !isOutgoingPendingRequest(user) && !isIncomingPendingRequest(user)" 
                  @click="addFriend(user)"
                  class="btn primary"
                >
                  添加好友
                </button>
                <span v-else-if="user.status" class="status-text">已是好友</span>
                <span v-else-if="isOutgoingPendingRequest(user)" class="status-text">已发送申请</span>
                <span v-else-if="isIncomingPendingRequest(user)" class="status-text notice-text">对方向你发送好友申请</span>
                <span v-else class="status-text">暂不可申请</span>
              </div>
            </div>
            </template>
          </div>
          <div v-else-if="searchAttempted && searchError" class="search-error">
            {{ searchError }}
          </div>
        </div>
        <div class="modal-footer">
          <button @click="closeAddFriendDialog" class="modal-btn cancel-btn" style="width: 100%;">关闭</button>
        </div>
      </div>
    </div>
    
    <!-- 用户信息对话框 -->
    <div v-if="showUserInfoDialog" class="modal-overlay user-info-overlay" @click="closeUserInfoDialog">
      <div class="modal-content user-info-modal" @click.stop>
        <div class="modal-header">
          <h3>{{ selectedUserInfo.isAIFriend ? 'AI好友信息' : '用户信息' }}</h3>
          <button class="modal-close-btn" @click="closeUserInfoDialog">×</button>
        </div>
        <div class="modal-body user-info-body">
          <div class="user-info-avatar-large">
            <div 
              class="avatar-large avatar-clickable"
              :class="{ 'ai-friend-avatar': selectedUserInfo.isAIFriend }"
              :style="selectedUserInfo.avatar && !selectedUserInfo.isAIFriend ? { backgroundImage: `url(${getImageUrl(selectedUserInfo.avatar)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}"
              @click="selectedUserInfo.avatar && !selectedUserInfo.isAIFriend ? previewAvatar(selectedUserInfo.avatar) : null"
            >
              <span v-if="selectedUserInfo.isAIFriend">🤖</span>
              <span v-else-if="!selectedUserInfo.avatar">{{ (selectedUserInfo.name || selectedUserInfo.username || 'U')?.charAt(0) }}</span>
            </div>
          </div>
          <div class="user-info-details">
            <!-- AI好友专用界面 -->
            <template v-if="selectedUserInfo.isAIFriend">
              <div class="user-info-name">{{ selectedUserInfo.name || 'AI好友' }}</div>
              <div class="user-info-ai-type">人格类型：{{ selectedUserInfo.friend_type_name || '温暖倾听型' }}</div>
              
              <!-- 用户昵称设置 -->
              <div class="user-info-setting-item">
                <label>用户昵称（AI如何称呼你）：</label>
                <div v-if="!isEditingUserNickname" class="setting-value">
                  <span>{{ selectedUserInfo.user_nickname || '未设置' }}</span>
                  <button @click="startEditUserNickname" class="edit-btn">编辑</button>
                </div>
                <div v-else class="setting-edit">
                  <input
                    v-model="editingUserNickname"
                    @keydown.enter="saveUserNickname"
                    @keydown.esc="cancelEditUserNickname"
                    class="setting-input"
                    placeholder="输入昵称"
                    maxlength="20"
                    ref="userNicknameInputRef"
                  />
                  <div class="setting-edit-buttons">
                    <button @click="saveUserNickname" class="setting-save-btn">✓</button>
                    <button @click="cancelEditUserNickname" class="setting-cancel-btn">✕</button>
                  </div>
                </div>
              </div>
              
              <!-- AI名字自定义 -->
              <div class="user-info-setting-item">
                <label>AI名字（你如何称呼AI）：</label>
                <div v-if="!isEditingAIName" class="setting-value">
                  <span>{{ selectedUserInfo.ai_name || '未设置' }}</span>
                  <button @click="startEditAIName" class="edit-btn">编辑</button>
                </div>
                <div v-else class="setting-edit">
                  <input
                    v-model="editingAIName"
                    @keydown.enter="saveAIName"
                    @keydown.esc="cancelEditAIName"
                    class="setting-input"
                    placeholder="输入AI名字"
                    maxlength="20"
                    ref="aiNameInputRef"
                  />
                  <div class="setting-edit-buttons">
                    <button @click="saveAIName" class="setting-save-btn">✓</button>
                    <button @click="cancelEditAIName" class="setting-cancel-btn">✕</button>
                  </div>
                </div>
              </div>
              
              <!-- 人格切换 -->
              <div class="user-info-setting-item">
                <label>人格类型：</label>
                <select v-model="selectedAIFriendType" @change="switchAIFriendType" class="ai-friend-type-select">
                  <option value="warm">温暖倾听型</option>
                  <option value="humorous">幽默开朗型</option>
                  <option value="rational">理性分析型</option>
                  <option value="energetic">活力鼓励型</option>
                </select>
              </div>
              
              <!-- 清空上下文按钮 -->
              <div class="user-info-setting-item">
                <button @click="showClearContextConfirm = true" class="btn danger full-width">清空上下文</button>
              </div>
            </template>
            
            <!-- 普通用户界面 -->
            <template v-else>
              <!-- 如果没有备注，第一行显示昵称 -->
              <div v-if="selectedUserInfo.is_friend && !selectedUserInfo.remark" class="user-info-name">
                {{ selectedUserInfo.name || selectedUserInfo.username || '用户' }}
              </div>
              <!-- 如果有备注，第一行显示备注 -->
              <div v-else-if="selectedUserInfo.is_friend && selectedUserInfo.remark" class="user-info-name">
                {{ selectedUserInfo.remark }}
              </div>
              <!-- 如果不是好友，显示昵称 -->
              <div v-else class="user-info-name">{{ selectedUserInfo.name || selectedUserInfo.username || '用户' }}</div>
              
              <!-- 如果是群聊且有群聊昵称，显示群聊昵称（最上面） -->
              <div v-if="currentChatInfo?.type === 'group' && selectedUserInfo.group_nickname && selectedUserInfo.group_nickname !== selectedUserInfo.name" class="user-info-group-nickname">群聊昵称：{{ selectedUserInfo.group_nickname }}</div>
              
              <!-- 如果有备注，显示昵称行 -->
              <div v-if="selectedUserInfo.is_friend && selectedUserInfo.remark" class="user-info-nickname">昵称：{{ selectedUserInfo.name || selectedUserInfo.username || '未知' }}</div>
              
              <!-- 用户名行 -->
              <div class="user-info-username">用户名：{{ selectedUserInfo.username || '未知' }}</div>
              
              <!-- 邮箱行 -->
              <div class="user-info-email">邮箱：{{ selectedUserInfo.email || '未知' }}</div>
              
              <!-- 个性签名行 -->
              <div class="user-info-signature" v-if="selectedUserInfo.signature">
                个性签名：{{ selectedUserInfo.signature }}
              </div>
              
              <div v-if="selectedFriendRequest" class="user-info-greeting-line">打招呼内容：{{ selectedFriendRequest.greeting || '-' }}</div>
              <div v-if="selectedFriendRequest && selectedFriendRequest.created_at" class="user-info-request-time">申请时间：{{ formatRequestTime(selectedFriendRequest.created_at) }}</div>
              
              <!-- 如果是好友，显示备注相关操作 -->
              <div v-if="selectedUserInfo.is_friend && !isEditingRemark" class="user-info-remark-hint">
                <!-- 如果有备注，显示修改备注的提示 -->
                <span v-if="selectedUserInfo.remark" class="remark-hint-text" @click="startEditRemark">修改备注名</span>
                <!-- 如果没有备注，显示添加备注的提示 -->
                <span v-else class="remark-hint-text" @click="startEditRemark">添加备注名</span>
              </div>
              <!-- 编辑备注输入框 -->
              <div v-if="selectedUserInfo.is_friend && isEditingRemark" class="remark-edit">
                <input
                  v-model="editingRemark"
                  @keydown.enter="saveRemark"
                  @keydown.esc="cancelEditRemark"
                  class="remark-input"
                  placeholder="输入备注名"
                  maxlength="20"
                  ref="remarkInputRef"
                />
                <div class="remark-edit-buttons">
                  <button @click="saveRemark" class="remark-save-btn">✓</button>
                  <button @click="cancelEditRemark" class="remark-cancel-btn">✕</button>
                </div>
              </div>
              
              <!-- 兴趣爱好显示 -->
              <div v-if="selectedUserInfo.interests" class="user-info-interests">
                <div class="user-info-interests-label">兴趣爱好：</div>
                <div class="user-info-interests-tags">
                  <span
                    v-for="tag in getInterestsArray(selectedUserInfo.interests)"
                    :key="tag"
                    class="user-info-interest-tag"
                  >
                    {{ tag }}
                  </span>
                </div>
              </div>
              
              <!-- 如果是好友且不是自己，显示拉黑/解除拉黑按钮 -->
              <div v-if="selectedUserInfo.is_friend && selectedUserInfo.id !== user.id" class="user-info-block-friend">
                <div class="user-info-divider"></div>
                <span v-if="!selectedUserInfo.is_blocked" class="block-friend-text" @click="showBlockFriendConfirm = true">拉黑</span>
                <span v-else class="block-friend-text" @click="showUnblockFriendConfirm = true">解除拉黑</span>
              </div>
              
              <!-- 如果不是好友但被拉黑且不是自己，显示解除拉黑按钮 -->
              <div v-if="!selectedUserInfo.is_friend && selectedUserInfo.is_blocked && selectedUserInfo.id !== user.id" class="user-info-block-friend">
                <div class="user-info-divider"></div>
                <span class="block-friend-text" @click="showUnblockFriendConfirm = true">解除拉黑</span>
              </div>
              
              <!-- 如果不是好友且不是查看好友申请且不是自己，显示添加好友按钮 -->
              <div v-if="!selectedUserInfo.is_friend && !selectedFriendRequest && selectedUserInfo.id !== user.id" class="user-info-add-friend">
                <button @click="addFriendFromUserInfo" class="btn primary full-width">添加好友</button>
              </div>
              
              <!-- 如果不是自己且有好友关系，显示发消息按钮 -->
              <div v-if="selectedUserInfo.id !== user.id && hasFriendRelation(selectedUserInfo.id)" class="user-info-send-message">
                <button @click="sendMessageToUser" class="btn send-message-btn full-width">发消息</button>
              </div>
              
              <!-- 如果是好友且不是自己，显示删除好友按钮 -->
              <div v-if="selectedUserInfo.is_friend && selectedUserInfo.id !== user.id" class="user-info-delete-friend">
                <button @click="deleteFriend" class="btn danger full-width">删除好友</button>
              </div>
            </template>
          </div>
        </div>
      <div v-if="selectedFriendRequest && selectedFriendRequestIsIncoming" class="user-info-request-actions">
        <button 
          class="btn primary"
          :disabled="isProcessingRequest(selectedFriendRequest.id)"
          @click="respondFriendRequest(selectedFriendRequest, 'accept')"
        >同意申请</button>
        <button 
          class="btn danger"
          :disabled="isProcessingRequest(selectedFriendRequest.id)"
          @click="respondFriendRequest(selectedFriendRequest, 'reject')"
        >拒绝申请</button>
      </div>
      </div>
    </div>
    
    <!-- 修改昵称对话框 -->
    <div v-if="showNicknameDialog" class="modal-overlay">
      <div class="modal-content">
        <div class="modal-header">
          <h3>修改昵称</h3>
          <button class="modal-close-btn" @click="closeNicknameDialog">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>昵称</label>
            <input
              v-model="editingNickname"
              @keydown.enter="saveNickname"
              class="modal-input"
              placeholder="请输入新昵称"
              maxlength="20"
              ref="nicknameInputRef"
            />
            <div class="form-hint">最多20个字符</div>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="closeNicknameDialog" class="modal-btn cancel-btn">取消</button>
          <button @click="saveNickname" class="modal-btn confirm-btn">保存</button>
        </div>
      </div>
    </div>

    <!-- 修改用户名对话框 -->
    <div v-if="showUsernameDialog" class="modal-overlay">
      <div class="modal-content auth-modal">
        <div class="modal-header">
          <h3>修改用户名</h3>
          <button class="modal-close-btn" @click="closeUsernameDialog">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>当前用户名</label>
            <div class="current-username-display">{{ props.user.username }}</div>
          </div>
          <div class="form-group">
            <label>新用户名 <span class="required">*</span></label>
            <input
              v-model="editingUsername"
              @input="validateUsername"
              class="modal-input"
              :class="{ 'input-error': usernameError || usernameExistsError }"
              placeholder="请输入新用户名（6-20字符，字母和数字）"
              minlength="6"
              maxlength="20"
              ref="usernameInputRef"
            />
            <div v-if="usernameError" class="form-error">{{ usernameError }}</div>
            <div v-else-if="usernameExistsError" class="form-error">{{ usernameExistsError }}</div>
            <div v-else class="form-hint">6-20个字符，只能包含字母和数字，不能有特殊字符</div>
          </div>
          <div class="form-group">
            <label>密码验证 <span class="required">*</span></label>
            <input
              v-model="usernamePassword"
              type="password"
              class="modal-input"
              :class="{ 'input-error': usernamePasswordError }"
              placeholder="请输入密码以验证身份"
              ref="usernamePasswordInputRef"
            />
            <div v-if="usernamePasswordError" class="form-error">{{ usernamePasswordError }}</div>
            <div class="forget-password-link-inline">
              <a href="#" @click.prevent="showUsernameForgetPassword = true">忘记密码？</a>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="closeUsernameDialog" class="modal-btn cancel-btn">取消</button>
          <button 
            @click="saveUsername" 
            class="modal-btn confirm-btn"
            :disabled="!!usernameError || !editingUsername || !usernamePassword"
          >
            保存
          </button>
        </div>
      </div>
    </div>

    <!-- 修改用户名时的忘记密码对话框 -->
    <div v-if="showUsernameForgetPassword" class="modal-overlay">
      <div class="modal-content auth-modal">
        <div class="modal-header">
          <h3>忘记密码</h3>
          <button class="modal-close-btn" @click="showUsernameForgetPassword = false">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>邮箱</label>
            <input 
              v-model="usernameForgetEmail" 
              type="email" 
              required 
              placeholder="请输入邮箱" 
              class="modal-input"
            />
          </div>
          <div class="form-group">
            <label>验证码</label>
            <div class="code-input-row">
              <input 
                v-model="usernameForgetCode" 
                type="text" 
                required 
                maxlength="6" 
                placeholder="请输入验证码" 
                class="modal-input code-input"
              />
              <button 
                type="button" 
                class="btn send-code-btn" 
                :disabled="usernameCodeSending || usernameCountdown > 0"
                @click="sendUsernameForgetCode"
              >
                {{ usernameCountdown > 0 ? `${usernameCountdown}秒` : (usernameCodeSending ? '发送中...' : '发送验证码') }}
              </button>
            </div>
          </div>
          <div class="form-group">
            <label>新密码</label>
            <input 
              v-model="usernameNewPassword" 
              type="password" 
              required 
              minlength="8"
              maxlength="16" 
              placeholder="8-16位，字母+数字+字符组合"
              @input="usernameForgetPasswordError = validateNewPasswordForUsername()"
              @blur="usernameForgetPasswordError = validateNewPasswordForUsername()"
              class="modal-input"
              :class="{ 'input-error': usernameForgetPasswordError }"
            />
            <div v-if="usernameForgetPasswordError" class="form-error">
              {{ usernameForgetPasswordError }}
            </div>
            <div v-else class="form-hint">
              密码要求：8-16位，必须包含英文字母和数字，不能是纯数字
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="showUsernameForgetPassword = false" class="modal-btn cancel-btn">取消</button>
          <button @click="onUsernameForgetPassword" class="modal-btn confirm-btn">重置密码</button>
        </div>
      </div>
    </div>
    <!-- 图片裁剪对话框 -->
    <ImageCropper
      :show="showCropper"
      :imageSrc="cropperImageSrc"
      @confirm="handleCropConfirm"
      @cancel="handleCropCancel"
    />

    <!-- 群头像裁剪对话框 -->
    <ImageCropper
      :show="showGroupAvatarCropper"
      :imageSrc="groupAvatarCropperSrc"
      @confirm="handleGroupAvatarCropConfirm"
      @cancel="handleGroupAvatarCropCancel"
    />

    <!-- 发起群聊弹窗 -->
    <div v-if="showCreateGroupModal" class="modal-overlay" @click.self="closeCreateGroupModal">
      <div class="modal-content create-group-modal">
        <div class="modal-header">
          <h3>发起群聊</h3>
        </div>
        <div class="modal-body create-group-body">
          <!-- 第一行：上传群头像 -->
          <div class="form-group">
            <label>群头像</label>
            <div class="group-avatar-upload">
              <div 
                v-if="createGroupAvatar"
                class="group-avatar-preview"
                :style="createGroupAvatar ? { backgroundImage: `url(${createGroupAvatar})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}"
              >
              </div>
              <button @click="selectGroupAvatar" class="btn secondary small">选择头像</button>
              <input 
                ref="groupAvatarInput"
                type="file"
                style="display: none"
                @change="handleGroupAvatarSelect"
                accept="image/*"
              />
            </div>
          </div>
          
          <!-- 第二行：群聊名输入框 -->
          <div class="form-group">
            <label>群聊名</label>
            <input 
              v-model="createGroupName" 
              placeholder="请输入群聊名"
              class="modal-input"
              maxlength="50"
            />
          </div>
          
          <!-- 第三行：搜索框 -->
          <div class="form-group">
            <input 
              v-model="createGroupSearchKeyword" 
              placeholder="搜索联系人..."
              class="modal-input"
              @input="filterCreateGroupContacts"
            />
          </div>
          
          <!-- 第四行开始：联系人列表 -->
          <div class="form-group">
            <label>选择联系人</label>
            <div class="create-group-contacts-list">
              <div 
                v-for="contact in filteredCreateGroupContacts" 
                :key="contact.user_id"
                class="create-group-contact-item"
                @click="toggleContactSelection(contact.user_id)"
              >
                <div class="contact-checkbox">
                  <div 
                    :class="['checkbox-circle', { checked: selectedContacts.has(contact.user_id) }]"
                  >
                    <span v-if="selectedContacts.has(contact.user_id)">✓</span>
                  </div>
                </div>
                <div 
                  class="contact-avatar-small"
                  :style="contact.avatar ? { backgroundImage: `url(${getImageUrl(contact.avatar)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}"
                >
                  <span v-if="!contact.avatar">{{ (contact.displayName || 'U').charAt(0) }}</span>
                </div>
                <div class="contact-name">{{ contact.displayName }}</div>
              </div>
              <div v-if="filteredCreateGroupContacts.length === 0" class="empty-contacts">
                {{ allContacts.length === 0 ? '没有可选择的联系人，请先添加好友' : '未找到匹配的联系人' }}
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="closeCreateGroupModal" class="modal-btn cancel-btn">取消</button>
          <button 
            @click="createGroup" 
            class="modal-btn confirm-btn"
            :disabled="selectedContacts.size < 1 || creatingGroup"
          >
            {{ creatingGroup ? '创建中...' : '完成' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 群聊信息头像裁剪对话框 -->
    <ImageCropper
      :show="showGroupInfoAvatarCropper"
      :imageSrc="groupInfoAvatarCropperSrc"
      @confirm="handleGroupInfoAvatarCropConfirm"
      @cancel="handleGroupInfoAvatarCropCancel"
    />

    <!-- 群聊信息弹窗 -->
    <div v-if="showGroupInfoModal" class="modal-overlay" @click.self="closeGroupInfoModal">
      <div class="modal-content group-info-modal">
        <div class="modal-header">
          <h3>群聊信息</h3>
          <button class="modal-close-btn" @click="closeGroupInfoModal">×</button>
        </div>
        <div class="modal-body group-info-body">
          <!-- 已解散的群聊只显示查找聊天记录按钮 -->
          <template v-if="groupInfo?.is_disbanded === 1">
            <!-- 查找聊天记录按钮 -->
            <div class="form-group">
              <button @click="openSearchHistory" class="btn secondary" style="width: 100%;">查找聊天记录</button>
            </div>
          </template>
          
          <!-- 未解散的群聊显示所有内容 -->
          <template v-else>
            <!-- 群名称和群id显示 -->
            <div class="form-group group-info-header">
              <div class="group-info-title">
                <div class="group-name-display">群名称：{{ groupInfo.name || getDefaultGroupName() }}</div>
                <div v-if="groupInfo.group_code" class="group-id-display">群id：{{ groupInfo.group_code }}</div>
              </div>
            </div>
            
            <!-- 第一行：搜索群成员 -->
            <div class="form-group">
              <input 
                v-model="groupMemberSearchKeyword" 
                placeholder="搜索群成员"
                class="modal-input"
                @input="filterGroupMembers"
              />
            </div>
            
            <!-- 第二行：群成员列表 -->
            <div class="form-group">
              <label>群成员（{{ filteredGroupMembers.length }}）</label>
              <div class="group-members-grid">
                <div 
                  v-for="member in filteredGroupMembers" 
                  :key="member.user_id"
                  class="group-member-item"
                >
                  <div 
                    class="group-member-avatar avatar-clickable"
                    :style="member.avatar ? { backgroundImage: `url(${getImageUrl(member.avatar)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}"
                    @click="showUserInfo(member.user_id, member.avatar, getMemberDisplayName(member))"
                  >
                    <span v-if="!member.avatar">{{ getMemberDisplayName(member).charAt(0) }}</span>
                  </div>
                  <div class="group-member-info">
                    <div class="group-member-name">{{ getMemberDisplayName(member) }}</div>
                    <!-- 如果匹配字段的值与显示名称不同，显示匹配字段信息 -->
                    <div 
                      v-if="member.matchField && member.matchField.value !== getMemberDisplayName(member)" 
                      class="group-member-match-field"
                    >
                      {{ getMatchFieldLabel(member.matchField) }}
                    </div>
                    <!-- 如果是群主，显示"群主"标识 -->
                    <div 
                      v-if="groupInfo && groupInfo.creator_id === member.user_id" 
                      class="group-member-owner"
                    >
                      群主
                    </div>
                    <!-- 如果是管理员，显示"管理员"标识 -->
                    <div 
                      v-else-if="isAdmin(member.user_id)" 
                      class="group-member-admin"
                    >
                      管理员
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- 第三行：添加按钮 -->
            <div class="form-group">
              <button @click="openAddGroupMemberModal" class="btn primary" style="width: 100%;">添加成员</button>
            </div>
            
            <!-- 第三行半：移除成员按钮（仅群主和管理员可见） -->
            <div v-if="canRemoveMembers" class="form-group">
              <button @click="openRemoveGroupMemberModal" class="btn secondary" style="width: 100%;">移除成员</button>
            </div>
            
            <!-- 第四行：群聊头像 -->
            <div class="form-group">
              <label>群聊头像</label>
              <div class="group-info-avatar-section">
                <div 
                  class="group-info-avatar avatar-clickable"
                  :style="groupInfo.avatar ? { backgroundImage: `url(${getImageUrl(groupInfo.avatar)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}"
                  @click="groupInfo.avatar ? previewAvatar(groupInfo.avatar) : null"
                >
                  <span v-if="!groupInfo.avatar">群</span>
                </div>
                <button 
                  @click="selectGroupInfoAvatar" 
                  class="btn secondary small"
                >
                  上传头像
                </button>
                <input 
                  ref="groupInfoAvatarInput"
                  type="file"
                  style="display: none"
                  @change="handleGroupInfoAvatarSelect"
                  accept="image/*"
                />
              </div>
            </div>
            
            <!-- 第五行：群聊名称 -->
            <div class="form-group">
              <label>群聊名称</label>
              <div class="group-info-name-section">
                <div v-if="!editingGroupName" class="group-info-name-display" @click.stop="startEditGroupName">
                  {{ groupInfo.name || getDefaultGroupName() }}
                </div>
                <div v-else class="group-info-name-edit" ref="groupNameEditRef" @click.stop>
                  <input 
                    v-model="editingGroupNameValue" 
                    class="modal-input"
                    placeholder="请输入群聊名称（留空则使用默认名称）"
                    maxlength="50"
                    @keyup.enter="saveGroupName"
                    @keyup.esc="cancelEditGroupName"
                    ref="groupNameInput"
                  />
                  <div class="group-info-name-actions">
                    <button @click="saveGroupName" class="btn primary small">保存</button>
                    <button @click="cancelEditGroupName" class="btn secondary small">取消</button>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- 第六行：备注 -->
            <div class="form-group">
              <label>备注</label>
              <div class="group-info-remark-section">
                <div v-if="!editingGroupRemark" class="group-info-remark-display" @click.stop="startEditGroupRemark">
                  {{ groupRemark || '群聊的备注仅自己可见' }}
                </div>
                <div v-else class="group-info-remark-edit" ref="groupRemarkEditRef" @click.stop>
                  <input 
                    v-model="editingGroupRemarkValue" 
                    class="modal-input"
                    placeholder="请输入备注"
                    maxlength="50"
                    @keyup.enter="saveGroupRemark"
                    @keyup.esc="cancelEditGroupRemark"
                    ref="groupRemarkInput"
                  />
                  <div class="group-info-remark-actions">
                    <button @click="saveGroupRemark" class="btn primary small">保存</button>
                    <button @click="cancelEditGroupRemark" class="btn secondary small">取消</button>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- 第七行：我在本群的昵称 -->
            <div class="form-group">
              <label>我在本群的昵称</label>
              <div class="group-info-nickname-section">
                <div v-if="!editingGroupNickname" class="group-info-nickname-display" @click.stop="startEditGroupNickname">
                  {{ myGroupNickname || user?.name || user?.username || '用户' }}
                </div>
                <div v-else class="group-info-nickname-edit" ref="groupNicknameEditRef" @click.stop>
                  <input 
                    v-model="editingGroupNicknameValue" 
                    class="modal-input"
                    placeholder="请输入群昵称（留空则使用原昵称）"
                    maxlength="20"
                    @keyup.enter="saveGroupNickname"
                    @keyup.esc="cancelEditGroupNickname"
                    ref="groupNicknameInput"
                  />
                  <div class="group-info-nickname-actions">
                    <button @click="saveGroupNickname" class="btn primary small">保存</button>
                    <button @click="cancelEditGroupNickname" class="btn secondary small">取消</button>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- 群管理按钮 -->
            <div class="form-group">
              <button @click="openGroupManagementModal" class="btn secondary" style="width: 100%;">群管理</button>
            </div>
            
            <!-- 查找聊天记录按钮 -->
            <div class="form-group">
              <button @click="openSearchHistory" class="btn secondary" style="width: 100%;">查找聊天记录</button>
            </div>
            
            <!-- 群公告按钮 -->
            <div class="form-group">
              <button @click="openAnnouncementModal" class="btn secondary" style="width: 100%;">群公告</button>
            </div>
            
            <!-- 发消息按钮 -->
            <div class="form-group">
              <button @click="sendMessageToGroup" class="btn send-message-btn" style="width: 100%;">发消息</button>
            </div>
            
            <!-- 退出群聊按钮 -->
            <div class="form-group">
              <button @click="showLeaveGroupConfirm = true" class="btn danger" style="width: 100%;">退出群聊</button>
            </div>
          </template>
        </div>
      </div>
    </div>
    
    <!-- 添加群成员弹窗 -->
    <div v-if="showAddGroupMemberModal" class="modal-overlay" @click.self="closeAddGroupMemberModal">
      <div class="modal-content create-group-modal">
        <div class="modal-header">
          <h3>添加群成员</h3>
          <button class="modal-close-btn" @click="closeAddGroupMemberModal">×</button>
        </div>
        <div class="modal-body create-group-body">
          <!-- 搜索框 -->
          <div class="form-group">
            <input 
              v-model="addMemberSearchKeyword" 
              placeholder="搜索联系人..."
              class="modal-input"
              @input="filterAddMemberContacts"
            />
          </div>
          
          <!-- 联系人列表 -->
          <div class="form-group">
            <label>选择联系人</label>
            <div class="create-group-contacts-list">
              <div 
                v-for="contact in filteredAddMemberContacts" 
                :key="contact.user_id"
                class="create-group-contact-item"
                @click="toggleAddMemberSelection(contact.user_id)"
              >
                <div class="contact-checkbox">
                  <div 
                    :class="['checkbox-circle', { checked: selectedAddMembers.has(contact.user_id) }]"
                  >
                    <span v-if="selectedAddMembers.has(contact.user_id)">✓</span>
                  </div>
                </div>
                <div 
                  class="contact-avatar-small"
                  :style="contact.avatar ? { backgroundImage: `url(${getImageUrl(contact.avatar)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}"
                >
                  <span v-if="!contact.avatar">{{ (contact.displayName || 'U').charAt(0) }}</span>
                </div>
                <div class="contact-name">{{ contact.displayName }}</div>
              </div>
              <div v-if="filteredAddMemberContacts.length === 0" class="empty-contacts">
                {{ allAddMemberContacts.length === 0 ? '没有可选择的联系人，请先添加好友' : '未找到匹配的联系人' }}
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="closeAddGroupMemberModal" class="modal-btn cancel-btn">取消</button>
          <button 
            @click="addGroupMembers" 
            class="modal-btn confirm-btn"
            :disabled="selectedAddMembers.size === 0 || addingMembers"
          >
            {{ addingMembers ? '添加中...' : '添加' }}
          </button>
        </div>
      </div>
    </div>
    
    <!-- 移除成员弹窗 -->
    <div v-if="showRemoveGroupMemberModal" class="modal-overlay" @click.self="closeRemoveGroupMemberModal">
      <div class="modal-content create-group-modal">
        <div class="modal-header">
          <h3>移除成员</h3>
          <button class="modal-close-btn" @click="closeRemoveGroupMemberModal">×</button>
        </div>
        <div class="modal-body create-group-body">
          <!-- 搜索框 -->
          <div class="form-group">
            <input 
              v-model="removeMemberSearchKeyword" 
              placeholder="搜索群成员..."
              class="modal-input"
              @input="filterRemoveMembers"
            />
          </div>
          
          <!-- 群成员列表 -->
          <div class="form-group">
            <label>选择群成员</label>
            <div class="create-group-contacts-list">
              <div
                v-for="member in filteredRemoveMembers" 
                :key="member.user_id"
                class="create-group-contact-item"
                @click="toggleRemoveMemberSelection(member.user_id)"
              >
                <div class="contact-checkbox">
                  <div 
                    :class="['checkbox-circle', { checked: selectedRemoveMembers.has(member.user_id) }]"
                  >
                    <span v-if="selectedRemoveMembers.has(member.user_id)">✓</span>
                  </div>
                </div>
                <div 
                  class="contact-avatar-small"
                  :style="member.avatar ? { backgroundImage: `url(${getImageUrl(member.avatar)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}"
                >
                  <span v-if="!member.avatar">{{ getMemberDisplayName(member)?.charAt(0) || 'U' }}</span>
                </div>
                <div class="contact-name">{{ getMemberDisplayName(member) }}</div>
              </div>
              <div v-if="filteredRemoveMembers.length === 0" class="empty-contacts">
                {{ groupMembers.length === 0 ? '没有群成员' : '未找到匹配的群成员' }}
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="closeRemoveGroupMemberModal" class="modal-btn cancel-btn">取消</button>
          <button 
            @click="confirmRemoveMembers" 
            class="modal-btn confirm-btn"
            :disabled="selectedRemoveMembers.size === 0 || removingMembers"
          >
            {{ removingMembers ? '移除中...' : '确认' }}
          </button>
        </div>
      </div>
    </div>
    
    <!-- 移除成员确认弹窗 -->
    <div v-if="showRemoveMemberConfirm" class="modal-overlay" @click.self="showRemoveMemberConfirm = false">
      <div class="modal-content">
        <div class="modal-header">
          <h3>移除成员</h3>
        </div>
        <div class="modal-body">
          <p>你即将移出成员{{ pendingRemoveMemberDisplayName }}</p>
          <p>确定移除成员吗？</p>
        </div>
        <div class="modal-footer">
          <button @click="showRemoveMemberConfirm = false" class="modal-btn cancel-btn">取消</button>
          <button @click="executeRemoveMember" class="modal-btn danger-btn" :disabled="removingMembers">
            {{ removingMembers ? '移除中...' : '确认移除' }}
          </button>
        </div>
      </div>
    </div>
    
    <!-- 退出群聊确认弹窗 -->
    <div v-if="showLeaveGroupConfirm" class="modal-overlay">
      <div class="modal-content">
        <div class="modal-header">
          <h3>退出群聊</h3>
        </div>
        <div class="modal-body">
          <p>你是否要退出群聊，确认后无法更改</p>
        </div>
        <div class="modal-footer">
          <button @click="showLeaveGroupConfirm = false" class="modal-btn cancel-btn">取消</button>
          <button @click="leaveGroup" class="modal-btn danger-btn">确认</button>
        </div>
      </div>
    </div>

    <!-- 转发消息对话框 -->
    <div v-if="showForwardModal" class="modal-overlay">
      <div class="modal-content forward-modal">
        <div class="modal-header">
          <h3>转发消息</h3>
          <button class="modal-close-btn" @click="closeForwardModal">×</button>
        </div>
        <div class="modal-body">
          <!-- 原消息预览 -->
          <div v-if="forwardMessage" class="forward-preview">
            <div class="forward-preview-label">要转发的消息：</div>
            <div class="forward-preview-content">
              <!-- 转发消息类型 -->
              <div v-if="forwardMessage.media_type === 'forward_multiple' || (forwardMessage.forward_info && forwardMessage.forward_info.messages)" class="forwarded-message-card">
                <div class="forwarded-message-title">
                  {{ getForwardMessageTitle(forwardMessage) }}
                </div>
                <div class="forwarded-message-preview">
                  {{ getForwardMessagePreview(forwardMessage) }}
                </div>
              </div>
              <!-- 文本消息 -->
              <div v-else-if="forwardMessage.type === 'text' || forwardMessage.media_type === 'text' || (!forwardMessage.media_type && forwardMessage.content)" class="message-text-preview" v-html="formatMessageContent(forwardMessage.content)"></div>
              <!-- 图片消息 -->
              <div v-else-if="forwardMessage.type === 'image' || forwardMessage.media_type === 'image'" class="message-image-preview">
                <img :src="getImageUrl(forwardMessage.content)" alt="图片" />
              </div>
              <!-- 文件消息 -->
              <div v-else-if="forwardMessage.type === 'file' || forwardMessage.media_type === 'file'" class="message-file-preview">
                📎 {{ getFileName(forwardMessage.content) }}
                <span v-if="forwardMessage.file_size" class="file-size">{{ forwardMessage.file_size }}</span>
              </div>
              <!-- 默认显示内容 -->
              <div v-else-if="forwardMessage.content" class="message-text-preview" v-html="formatMessageContent(forwardMessage.content)"></div>
              <div v-else class="message-unknown-preview">
                [未知类型消息]
              </div>
            </div>
          </div>
          
          <!-- 选择转发目标 -->
          <div class="form-group">
            <label>选择转发目标</label>
            <div class="forward-target-list">
              <div 
                v-for="chat in chatList" 
                :key="chat.room"
                :class="['forward-target-item', { active: forwardTarget?.room === chat.room }]"
                @click="forwardTarget = chat"
              >
                <div 
                  class="avatar-small"
                  :style="chat.avatar ? { backgroundImage: `url(${getImageUrl(chat.avatar)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}"
                >
                  <span v-if="!chat.avatar">{{ chat.name?.charAt(0) || 'U' }}</span>
                </div>
                <div class="forward-target-info">
                  <div class="forward-target-name">{{ chat.name }}</div>
                  <div class="forward-target-type">{{ chat.chat_type === 'private' ? '私聊' : '群聊' }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="closeForwardModal" class="modal-btn cancel-btn">取消</button>
          <button 
            @click="executeForward" 
            class="modal-btn confirm-btn"
            :disabled="!forwardTarget"
          >
            发送
          </button>
        </div>
      </div>
    </div>
    
    <!-- 多选转发模态框 -->
    <div v-if="showMultiForwardModal" class="modal-overlay">
      <div class="modal-content forward-modal multi-forward-modal">
        <div class="modal-header">
          <h3>转发聊天记录</h3>
          <button class="modal-close-btn" @click="closeMultiForwardModal">×</button>
        </div>
        <div class="modal-body">
          <!-- 聊天记录预览 -->
          <div class="multi-forward-preview">
            <div class="forward-chat-title">
              {{ getForwardChatTitle() }}
            </div>
            <div class="forward-messages-list">
              <div 
                v-for="msg in getSelectedMessagesList()" 
                :key="msg.id"
                class="forward-message-item"
              >
                <div 
                  class="forward-message-avatar"
                  :style="getMessageAvatarStyle(msg) ? { backgroundImage: `url(${getImageUrl(getMessageAvatarStyle(msg))})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}"
                >
                  <span v-if="!getMessageAvatarStyle(msg)">{{ msg.nickname?.charAt(0) || 'U' }}</span>
                </div>
                <div class="forward-message-content">
                  <!-- 转发消息类型 -->
                  <div v-if="msg.media_type === 'forward_multiple' || (msg.forward_info && msg.forward_info.messages)" class="forward-message-forwarded">
                    <div class="forwarded-message-title">
                      {{ getForwardMessageTitle(msg) }}
                    </div>
                    <div class="forwarded-message-preview">
                      {{ getForwardMessagePreview(msg) }}
                    </div>
                  </div>
                  <!-- 文本消息 -->
                  <div v-else-if="msg.type === 'text' || msg.media_type === 'text'" class="forward-message-text" v-html="formatMessageContent(msg.content)"></div>
                  <!-- 图片消息 -->
                  <div v-else-if="msg.type === 'image' || msg.media_type === 'image'" class="forward-message-image">
                    <img :src="getImageUrl(msg.content)" alt="图片" />
                  </div>
                  <!-- 文件消息 -->
                  <div v-else-if="msg.type === 'file' || msg.media_type === 'file'" class="forward-message-file">
                    📎 {{ getFileName(msg.content) }}
                    <span v-if="msg.file_size" class="file-size">{{ msg.file_size }}</span>
                  </div>
                  <!-- 其他类型或默认显示内容 -->
                  <div v-else-if="msg.content" class="forward-message-text" v-html="formatMessageContent(msg.content)"></div>
                  <div v-else class="forward-message-unknown">[未知类型消息]</div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- 选择转发目标 -->
          <div class="form-group">
            <label>选择转发目标</label>
            <div class="forward-target-list">
              <div 
                v-for="chat in chatList" 
                :key="chat.room"
                :class="['forward-target-item', { active: multiForwardTarget?.room === chat.room }]"
                @click="multiForwardTarget = chat"
              >
                <div 
                  class="avatar-small"
                  :style="chat.avatar ? { backgroundImage: `url(${getImageUrl(chat.avatar)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}"
                >
                  <span v-if="!chat.avatar">{{ chat.name?.charAt(0) || 'U' }}</span>
                </div>
                <div class="forward-target-info">
                  <div class="forward-target-name">{{ chat.name }}</div>
                  <div class="forward-target-type">{{ chat.chat_type === 'private' ? '私聊' : '群聊' }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="closeMultiForwardModal" class="modal-btn cancel-btn">取消</button>
          <button 
            @click="executeMultiForward" 
            class="modal-btn confirm-btn"
            :disabled="!multiForwardTarget || selectedMessages.size === 0"
          >
            发送
          </button>
        </div>
      </div>
    </div>
    
    <!-- 转发消息详情弹窗 -->
    <div v-if="showForwardMessagesDetailModal" class="modal-overlay" @click.self="handleForwardMessagesDetailOverlayClick">
      <div class="modal-content forward-modal">
        <div class="modal-header">
          <div class="modal-header-left">
            <button 
              v-if="forwardMessagesDetailStack.length > 0" 
              class="modal-back-btn" 
              @click="goBackForwardMessagesDetail"
              title="返回上一级"
            >
              ←
            </button>
            <h3>{{ forwardMessagesDetailTitle }}</h3>
          </div>
          <button class="modal-close-btn" @click="handleForwardMessagesDetailClose">×</button>
        </div>
        <div class="modal-body">
          <div class="forward-messages-list">
            <div 
              v-for="msg in forwardMessagesDetailList" 
              :key="msg.id"
              class="forward-message-item"
            >
              <div 
                class="forward-message-avatar"
                :style="msg.sender_avatar ? { backgroundImage: `url(${getImageUrl(msg.sender_avatar)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}"
              >
                <span v-if="!msg.sender_avatar">{{ msg.sender_name?.charAt(0) || 'U' }}</span>
              </div>
              <div class="forward-message-content">
                <!-- 嵌套的转发消息 -->
                <div v-if="isNestedForwardMessage(msg)" class="forward-message-forwarded" @click="showNestedForwardMessagesModal(msg)">
                  <div class="forwarded-message-title">
                    {{ getNestedForwardMessageTitle(msg) }}
                  </div>
                  <div class="forwarded-message-preview">
                    {{ getNestedForwardMessagePreview(msg) }}
                  </div>
                </div>
                <!-- 文本消息 -->
                <div v-else-if="msg.media_type === 'text' || (!msg.media_type && msg.content && !isJsonString(msg.content))" class="forward-message-text" v-html="formatMessageContent(msg.content)"></div>
                <!-- 图片消息 -->
                <div v-else-if="msg.media_type === 'image'" class="forward-message-image">
                  <img :src="getImageUrl(msg.content)" alt="图片" />
                </div>
                <!-- 文件消息 -->
                <div v-else-if="msg.media_type === 'file'" class="forward-message-file">
                  📎 {{ getFileName(msg.content) }}
                  <span v-if="msg.file_size" class="file-size">{{ msg.file_size }}</span>
                </div>
                <!-- 默认显示内容 -->
                <div v-else-if="msg.content && !isJsonString(msg.content)" class="forward-message-text" v-html="formatMessageContent(msg.content)"></div>
                <div v-else class="forward-message-unknown">[未知类型消息]</div>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="handleForwardMessagesDetailClose" class="modal-btn confirm-btn">关闭</button>
        </div>
      </div>
    </div>
    
    <!-- 选择收藏弹窗 -->
    <div v-if="showSelectFavoriteModal" class="modal-overlay" @click.self="closeSelectFavoriteModal">
      <div class="modal-content select-favorite-modal">
        <div class="modal-header">
          <h3>选择收藏</h3>
          <button class="modal-close-btn" @click="closeSelectFavoriteModal">×</button>
        </div>
        <div class="modal-body select-favorite-body">
          <!-- 收藏夹分类按钮 -->
          <div class="select-favorite-categories">
            <button 
              :class="['favorite-category-btn', { active: favoriteCategory === 'all' }]"
              @click="favoriteCategory = 'all'"
            >
              全部收藏
            </button>
            <button 
              :class="['favorite-category-btn', { active: favoriteCategory === 'image' }]"
              @click="favoriteCategory = 'image'"
            >
              图片
            </button>
            <button 
              :class="['favorite-category-btn', { active: favoriteCategory === 'file' }]"
              @click="favoriteCategory = 'file'"
            >
              文件
            </button>
            <button 
              :class="['favorite-category-btn', { active: favoriteCategory === 'message' }]"
              @click="favoriteCategory = 'message'"
            >
              聊天记录
            </button>
          </div>
          
          <!-- 收藏列表 -->
          <div class="select-favorites-list">
            <div 
              v-for="item in filteredFavorites" 
              :key="item.id"
              class="select-favorite-item"
              @click="toggleFavoriteSelection(item.id)"
            >
              <!-- 复选框 -->
              <div class="select-favorite-checkbox">
                <div 
                  :class="['checkbox-circle', { checked: selectedFavoritesForSend.has(item.id) }]"
                >
                  <span v-if="selectedFavoritesForSend.has(item.id)">✓</span>
                </div>
              </div>
              
              <!-- 图片收藏 -->
              <div v-if="item.type === 'image'" class="favorite-image-item">
                <img :src="getImageUrl(item.content)" alt="收藏的图片" />
                <div v-if="item.chat_title" class="favorite-item-source">
                  {{ getFavoriteSourceText(item) }}
                </div>
                <div class="favorite-item-time">{{ formatFavoriteTime(item.created_at) }}</div>
              </div>
              <!-- 文件收藏 -->
              <div v-else-if="item.type === 'file'" class="favorite-file-item">
                <div class="favorite-file-header">
                  <div class="favorite-file-icon">📎</div>
                  <div class="favorite-file-info">
                    <div class="favorite-file-name">{{ getFileName(item.content) }}</div>
                    <div class="favorite-file-size" v-if="item.file_size">{{ item.file_size }}</div>
                  </div>
                </div>
                <div v-if="item.chat_title" class="favorite-item-source">
                  {{ getFavoriteSourceText(item) }}
                </div>
                <div class="favorite-item-time">{{ formatFavoriteTime(item.created_at) }}</div>
              </div>
              <!-- 聊天记录收藏 -->
              <div v-else-if="item.type === 'message'" class="favorite-message-item">
                <!-- 如果是转发消息（JSON格式），显示为卡片 -->
                <div v-if="isForwardMessage(item.content)" class="forwarded-message-card">
                  <div class="forwarded-message-title">
                    {{ getFavoriteForwardTitle(item.content) }}
                  </div>
                  <div class="forwarded-message-preview">
                    {{ getFavoriteForwardPreview(item.content) }}
                  </div>
                </div>
                <!-- 普通消息 -->
                <div v-else class="favorite-message-content" v-html="formatMessageContent(item.content)"></div>
                <!-- 显示来源信息（仅单条消息，非转发消息） -->
                <div v-if="!isForwardMessage(item.content) && item.chat_title" class="favorite-item-source">
                  {{ getFavoriteSourceText(item) }}
                </div>
                <div class="favorite-item-time">{{ formatFavoriteTime(item.created_at) }}</div>
              </div>
              <!-- 其他类型 -->
              <div v-else class="favorite-other-item">
                <div class="favorite-other-content">{{ item.content }}</div>
                <div class="favorite-item-time">{{ formatFavoriteTime(item.created_at) }}</div>
              </div>
            </div>
            <div v-if="filteredFavorites.length === 0" class="empty-favorites">
              暂无收藏
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="closeSelectFavoriteModal" class="modal-btn cancel-btn">取消</button>
          <button 
            @click="sendSelectedFavorites" 
            class="modal-btn confirm-btn"
            :disabled="selectedFavoritesForSend.size === 0"
          >
            发送({{ selectedFavoritesForSend.size }})
          </button>
        </div>
      </div>
    </div>
    
    <!-- 群管理弹窗 -->
    <div v-if="showGroupManagementModal" class="modal-overlay" @click.self="closeGroupManagementModal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>群管理</h3>
          <button class="modal-close-btn" @click="closeGroupManagementModal">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <button @click="openTransferOwnershipModal" class="btn secondary" style="width: 100%;">群主管理权转让</button>
          </div>
          <div class="form-group">
            <button @click="openGroupAdminModal" class="btn secondary" style="width: 100%;">群管理员</button>
          </div>
          <div class="form-group">
            <button @click="showDisbandGroupConfirm = true" class="btn danger" style="width: 100%;">解散该群聊</button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 解散群聊确认弹窗 -->
    <div v-if="showDisbandGroupConfirm" class="modal-overlay" @click.self="showDisbandGroupConfirm = false">
      <div class="modal-content">
        <div class="modal-header">
          <h3>确认解散群聊</h3>
          <button class="modal-close-btn" @click="showDisbandGroupConfirm = false">×</button>
        </div>
        <div class="modal-body">
          <p>确定要解散该群聊吗？解散后所有成员将无法再发言，但可以查看聊天记录。</p>
        </div>
        <div class="modal-footer">
          <button @click="showDisbandGroupConfirm = false" class="modal-btn cancel-btn">取消</button>
          <button @click="disbandGroup" class="modal-btn confirm-btn danger" :disabled="disbandingGroup">
            {{ disbandingGroup ? '解散中...' : '确认' }}
          </button>
        </div>
      </div>
    </div>
    
    <!-- 删除好友确认弹窗 -->
    <div v-if="showDeleteFriendConfirm" class="modal-overlay delete-friend-overlay" @click.self="showDeleteFriendConfirm = false">
      <div class="modal-content">
        <div class="modal-header">
          <h3>删除好友</h3>
          <button class="modal-close-btn" @click="showDeleteFriendConfirm = false">×</button>
        </div>
        <div class="modal-body">
          <p>确定要删除好友"<strong>{{ deleteFriendName }}</strong>"吗？</p>
          <p style="color: #999; font-size: 14px; margin-top: 8px;">删除后，对方将从您的好友列表中消失，所有聊天记录将被清空。</p>
        </div>
        <div class="modal-footer">
          <button @click="showDeleteFriendConfirm = false" class="modal-btn cancel-btn">取消</button>
          <button @click="confirmDeleteFriend" class="modal-btn danger-btn">确认删除</button>
        </div>
      </div>
    </div>
    
    <!-- 拉黑好友确认弹窗 -->
    <div v-if="showBlockFriendConfirm" class="modal-overlay block-friend-overlay" @click.self="showBlockFriendConfirm = false">
      <div class="modal-content">
        <div class="modal-header">
          <h3>拉黑好友</h3>
          <button class="modal-close-btn" @click="showBlockFriendConfirm = false">×</button>
        </div>
        <div class="modal-body">
          <p>即将拉黑好友<strong>{{ blockFriendDisplayName }}</strong></p>
          <p style="color: #999; font-size: 14px; margin-top: 8px;">拉黑后对方将无法给你发送消息，但你们仍然是好友关系</p>
        </div>
        <div class="modal-footer">
          <button @click="showBlockFriendConfirm = false" class="modal-btn cancel-btn">取消</button>
          <button @click="confirmBlockFriend" class="modal-btn danger-btn">确认拉黑</button>
        </div>
      </div>
    </div>

    <!-- AI好友类型选择对话框 -->
    <div v-if="showAIFriendTypeModal" class="modal-overlay" @click.self="showAIFriendTypeModal = false">
      <div class="modal-content" style="max-width: 500px;" @click.stop>
        <div class="modal-header">
          <h3>选择你的AI朋友类型</h3>
          <button class="modal-close-btn" @click="showAIFriendTypeModal = false">×</button>
        </div>
        <div class="modal-body">
          <div class="ai-friend-type-list">
            <div 
              v-for="type in aiFriendTypes" 
              :key="type.value"
              :class="['ai-friend-type-item', { active: selectedAIFriendType === type.value }]"
              @click="selectedAIFriendType = type.value"
            >
              <div class="ai-friend-type-name">{{ type.name }}</div>
              <div class="ai-friend-type-desc">{{ type.description }}</div>
            </div>
          </div>
          <div class="form-group" style="margin-top: 20px;">
            <button @click="confirmAIFriendType" class="btn primary" style="width: 100%;">确认</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 解除拉黑好友确认弹窗 -->
    <div v-if="showUnblockFriendConfirm" class="modal-overlay block-friend-overlay" @click.self="showUnblockFriendConfirm = false">
      <div class="modal-content">
        <div class="modal-header">
          <h3>解除拉黑</h3>
          <button class="modal-close-btn" @click="showUnblockFriendConfirm = false">×</button>
        </div>
        <div class="modal-body">
          <p>即将解除拉黑好友<strong>{{ blockFriendDisplayName }}</strong></p>
          <p style="color: #999; font-size: 14px; margin-top: 8px;">解除拉黑后对方可以正常给你发送消息</p>
        </div>
        <div class="modal-footer">
          <button @click="showUnblockFriendConfirm = false" class="modal-btn cancel-btn">取消</button>
          <button @click="confirmUnblockFriend" class="modal-btn danger-btn">确认解除</button>
        </div>
      </div>
    </div>

    <!-- 清空上下文确认弹窗 -->
    <div v-if="showClearContextConfirm" class="modal-overlay block-friend-overlay" @click.self="showClearContextConfirm = false">
      <div class="modal-content">
        <div class="modal-header">
          <h3>清空上下文</h3>
          <button class="modal-close-btn" @click="showClearContextConfirm = false">×</button>
        </div>
        <div class="modal-body">
          <p>确定要清空上下文吗？</p>
          <p style="color: #999; font-size: 14px; margin-top: 8px;">这将清除所有对话历史，但不会删除已保存的消息记录</p>
        </div>
        <div class="modal-footer">
          <button @click="showClearContextConfirm = false" class="modal-btn cancel-btn">取消</button>
          <button @click="confirmClearContext" class="modal-btn danger-btn">确认清空</button>
        </div>
      </div>
    </div>

    <!-- 设置弹窗 -->
    <div v-if="showSettingsModal" class="modal-overlay settings-modal-overlay" @click.self="showSettingsModal = false">
      <div class="modal-content settings-modal-content" @click.stop>
        <div class="modal-header">
          <h3>设置</h3>
          <button class="modal-close-btn" @click="showSettingsModal = false">×</button>
        </div>
        <div class="settings-body">
          <div class="settings-sidebar">
            <div 
              :class="['settings-menu-item', { active: settingsCurrentTab === 'signature' }]"
              @click="settingsCurrentTab = 'signature'"
            >
              个性签名
            </div>
            <div 
              :class="['settings-menu-item', { active: settingsCurrentTab === 'interests' }]"
              @click="settingsCurrentTab = 'interests'"
            >
              兴趣爱好
            </div>
            <div 
              :class="['settings-menu-item', { active: settingsCurrentTab === 'blacklist' }]"
              @click="settingsCurrentTab = 'blacklist'"
            >
              通讯录黑名单
            </div>
          </div>
          <div class="settings-content">
            <div v-if="settingsCurrentTab === 'signature'" class="profile-content">
              <div class="form-group">
                <label>个性签名</label>
                <textarea
                  v-model="editingSignature"
                  class="modal-input"
                  placeholder="请输入个性签名（最多50个字符）"
                  maxlength="50"
                  rows="3"
                  style="resize: vertical; min-height: 60px;"
                ></textarea>
                <div class="form-hint">{{ editingSignature.length }}/50</div>
              </div>
              <div class="form-group">
                <button @click="saveSignature" class="btn primary">保存</button>
              </div>
            </div>
            <div v-if="settingsCurrentTab === 'interests'" class="profile-content">
              <div class="form-group">
                <div class="interests-section">
                  <!-- 已选择的兴趣爱好 -->
                  <div class="interests-selected-section">
                    <div class="interests-section-title">已选择的兴趣爱好</div>
                    <div class="interests-tags">
                      <span
                        v-if="selectedInterests.length === 0"
                        class="interests-empty-hint"
                      >
                        暂无选择，请从下方标签中选择
                      </span>
                      <span
                        v-for="tag in selectedInterests"
                        :key="tag"
                        class="interest-tag selected"
                      >
                        {{ tag }}
                      </span>
                    </div>
                  </div>
                  
                  <!-- 搜索框 -->
                  <div class="interests-search-section">
                    <input
                      v-model="interestSearchQuery"
                      type="text"
                      class="interests-search-input"
                      placeholder="搜索兴趣爱好..."
                    />
                  </div>
                  
                  <!-- 搜索结果 -->
                  <div v-if="filteredTags.length > 0" class="interests-search-results">
                    <div class="interests-section-title">搜索结果</div>
                    <div class="interests-tags">
                      <span
                        v-for="tag in filteredTags"
                        :key="tag"
                        :class="['interest-tag', { active: selectedInterests.includes(tag) }]"
                        @click="toggleInterest(tag)"
                      >
                        {{ tag }}
                      </span>
                    </div>
                  </div>
                  
                  <!-- 分类标签 -->
                  <div class="interests-categories">
                    <div
                      v-for="category in interestCategories"
                      :key="category.name"
                      class="interest-category"
                    >
                      <button
                        class="category-button"
                        :class="{ expanded: expandedCategories.includes(category.name) }"
                        @click="toggleCategory(category.name)"
                      >
                        <span class="category-icon">{{ category.icon }}</span>
                        <span class="category-name">{{ category.name }}</span>
                        <span class="expand-icon">{{ expandedCategories.includes(category.name) ? '▼' : '▶' }}</span>
                      </button>
                      <div
                        v-if="expandedCategories.includes(category.name)"
                        class="category-tags"
                      >
                        <span
                          v-for="tag in category.tags"
                          :key="tag"
                          :class="['interest-tag', { active: selectedInterests.includes(tag) }]"
                          @click="toggleInterest(tag)"
                        >
                          {{ tag }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="form-group">
                <button @click="saveInterests" class="btn primary">保存</button>
              </div>
            </div>
            <div v-if="settingsCurrentTab === 'blacklist'" class="blacklist-content">
              <div v-if="blacklist.length === 0" class="empty-blacklist">
                <div class="empty-text">黑名单为空</div>
              </div>
              <div v-else class="blacklist-list">
                <div 
                  v-for="user in blacklist" 
                  :key="user.id"
                  class="blacklist-item"
                  @click="showBlacklistUserInfo(user)"
                >
                  <div 
                    class="avatar-small"
                    :style="user.avatar ? { backgroundImage: `url(${getImageUrl(user.avatar)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}"
                  >
                    <span v-if="!user.avatar">{{ (user.name || user.username || 'U')?.charAt(0) }}</span>
                  </div>
                  <div class="friend-name">
                    {{ user.remark || user.name || user.username }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 删除已解散群聊确认弹窗 -->
    <div v-if="showDeleteChatConfirm" class="modal-overlay" @click.self="showDeleteChatConfirm = false">
      <div class="modal-content">
        <div class="modal-header">
          <h3>删除"{{ deleteChatName }}"</h3>
          <button class="modal-close-btn" @click="showDeleteChatConfirm = false">×</button>
        </div>
        <div class="modal-body">
          <p style="color: #666; font-size: 14px;">删除聊天后，聊天记录也将被清空</p>
        </div>
        <div class="modal-footer">
          <button @click="showDeleteChatConfirm = false" class="modal-btn cancel-btn">取消</button>
          <button @click="deleteChat" class="modal-btn confirm-btn danger" :disabled="deletingChat">
            {{ deletingChat ? '删除中...' : '删除' }}
          </button>
        </div>
      </div>
    </div>
    
    <!-- 选择新群主弹窗 -->
    <div v-if="showTransferOwnershipModal" class="modal-overlay" @click.self="closeTransferOwnershipModal">
      <div class="modal-content create-group-modal">
        <div class="modal-header">
          <h3>选择新群主</h3>
          <button class="modal-close-btn" @click="closeTransferOwnershipModal">×</button>
        </div>
        <div class="modal-body create-group-body">
          <!-- 搜索框 -->
          <div class="form-group">
            <input 
              v-model="transferOwnershipSearchKeyword" 
              placeholder="搜索群成员..."
              class="modal-input"
              @input="filterTransferOwnershipMembers"
            />
          </div>
          
          <!-- 群成员列表 -->
          <div class="form-group">
            <label>选择群成员</label>
            <div class="create-group-contacts-list">
              <div 
                v-for="member in filteredTransferOwnershipMembers" 
                :key="member.user_id"
                class="create-group-contact-item"
                @click="toggleTransferOwnershipSelection(member.user_id)"
              >
                <div class="contact-checkbox">
                  <div 
                    :class="['checkbox-circle', { checked: selectedNewOwner === member.user_id }]"
                  >
                    <span v-if="selectedNewOwner === member.user_id">✓</span>
                  </div>
                </div>
                <div 
                  class="contact-avatar-small"
                  :style="member.avatar ? { backgroundImage: `url(${getImageUrl(member.avatar)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}"
                >
                  <span v-if="!member.avatar">{{ getMemberDisplayName(member)?.charAt(0) || 'U' }}</span>
                </div>
                <div class="contact-name">{{ getMemberDisplayName(member) }}</div>
              </div>
              <div v-if="filteredTransferOwnershipMembers.length === 0" class="empty-contacts">
                {{ groupMembers.length === 0 ? '没有群成员' : '未找到匹配的群成员' }}
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="closeTransferOwnershipModal" class="modal-btn cancel-btn">取消</button>
          <button 
            @click="transferGroupOwnership" 
            class="modal-btn confirm-btn"
            :disabled="!selectedNewOwner || transferringOwnership"
          >
            {{ transferringOwnership ? '转让中...' : '确认' }}
          </button>
        </div>
      </div>
    </div>
    
    <!-- 群管理员弹窗 -->
    <div v-if="showGroupAdminModal" class="modal-overlay" @click.self="closeGroupAdminModal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>群管理员</h3>
          <button class="modal-close-btn" @click="closeGroupAdminModal">×</button>
        </div>
        <div class="modal-body">
          <ul style="list-style: disc; padding-left: 20px; margin-bottom: 20px; color: #666; font-size: 14px;">
            <li>管理员可协助群主管理群聊，拥有发布群公告、移除群成员等能力。</li>
            <li>只有群主具备设置管理员、解散群聊的能力。</li>
          </ul>
          
          <!-- 管理员列表 -->
          <div class="form-group">
            <label>群管理员列表</label>
            <div v-if="loadingAdmins" style="text-align: center; padding: 20px; color: #999;">加载中...</div>
            <div v-else-if="groupAdmins.length === 0" style="text-align: center; padding: 20px; color: #999;">暂无管理员</div>
            <div v-else>
              <div 
                v-for="admin in groupAdmins" 
                :key="admin.user_id"
                style="display: flex; align-items: center; padding: 10px; border-bottom: 1px solid #eee;"
              >
                <div 
                  class="avatar-small"
                  :style="admin.avatar ? { backgroundImage: `url(${getImageUrl(admin.avatar)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}"
                >
                  <span v-if="!admin.avatar">{{ getAdminDisplayName(admin)?.charAt(0) || 'U' }}</span>
                </div>
                <div style="flex: 1; margin-left: 10px;">{{ getAdminDisplayName(admin) }}</div>
                <button 
                  @click="openRemoveAdminConfirm(admin)" 
                  class="btn danger"
                  style="padding: 4px 12px; font-size: 12px;"
                >
                  移除
                </button>
              </div>
            </div>
          </div>
          
          <div class="form-group">
            <button @click="openSelectAdminMembersModal" class="btn secondary" style="width: 100%;">添加成员</button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 选择群成员弹窗（用于添加管理员） -->
    <div v-if="showSelectAdminMembersModal" class="modal-overlay" @click.self="closeSelectAdminMembersModal">
      <div class="modal-content create-group-modal">
        <div class="modal-header">
          <h3>选择群成员</h3>
          <button class="modal-close-btn" @click="closeSelectAdminMembersModal">×</button>
        </div>
        <div class="modal-body create-group-body">
          <!-- 搜索框 -->
          <div class="form-group">
            <input 
              v-model="selectAdminMembersSearchKeyword" 
              placeholder="搜索群成员..."
              class="modal-input"
              @input="filterSelectAdminMembers"
            />
          </div>
          
          <!-- 群成员列表 -->
          <div class="form-group">
            <label>选择群成员</label>
            <div class="create-group-contacts-list">
              <div
                v-for="member in filteredSelectAdminMembers" 
                :key="member.user_id"
                class="create-group-contact-item"
                @click="toggleSelectAdminMemberSelection(member.user_id)"
              >
                <div class="contact-checkbox">
                  <div 
                    :class="['checkbox-circle', { checked: selectedAdminMembers.has(member.user_id) }]"
                  >
                    <span v-if="selectedAdminMembers.has(member.user_id)">✓</span>
                  </div>
                </div>
                <div 
                  class="contact-avatar-small"
                  :style="member.avatar ? { backgroundImage: `url(${getImageUrl(member.avatar)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}"
                >
                  <span v-if="!member.avatar">{{ getMemberDisplayName(member)?.charAt(0) || 'U' }}</span>
                </div>
                <div class="contact-name">{{ getMemberDisplayName(member) }}</div>
              </div>
              <div v-if="filteredSelectAdminMembers.length === 0" class="empty-contacts">
                {{ groupMembers.length === 0 ? '没有群成员' : '未找到匹配的群成员' }}
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="closeSelectAdminMembersModal" class="modal-btn cancel-btn">取消</button>
          <button 
            @click="confirmAddAdmins" 
            class="modal-btn confirm-btn"
            :disabled="selectedAdminMembers.size === 0 || addingAdmins"
          >
            {{ addingAdmins ? '添加中...' : '确认' }}
          </button>
        </div>
      </div>
    </div>
    
    <!-- 移除管理员确认弹窗 -->
    <div v-if="showRemoveAdminConfirm" class="modal-overlay" @click.self="showRemoveAdminConfirm = false">
      <div class="modal-content">
        <div class="modal-header">
          <h3>移除管理员</h3>
          <button class="modal-close-btn" @click="showRemoveAdminConfirm = false">×</button>
        </div>
        <div class="modal-body">
          <p>移除后，{{ adminToRemove ? getAdminDisplayName(adminToRemove) : '' }}将无法管理群聊</p>
        </div>
        <div class="modal-footer">
          <button @click="showRemoveAdminConfirm = false" class="modal-btn cancel-btn">取消</button>
          <button 
            @click="confirmRemoveAdmin" 
            class="modal-btn confirm-btn danger"
            :disabled="removingAdmin"
          >
            {{ removingAdmin ? '移除中...' : '移除管理权限' }}
          </button>
        </div>
      </div>
    </div>
    <!-- 查找聊天记录对话框 -->
    <div v-if="showSearchHistoryModal" class="modal-overlay" @click.self="closeSearchHistoryModal">
      <div class="modal-content search-history-modal">
        <div class="modal-header">
          <h3>
            <span v-if="currentChatInfo?.type === 'group'">
              {{ currentChatInfo?.name || '群聊' }}的聊天记录
              <span v-if="currentChatInfo?.member_count">（{{ currentChatInfo.member_count }}）</span>
            </span>
            <span v-else>与{{ currentChatInfo?.name || '对方' }}的聊天记录</span>
          </h3>
          <button class="modal-close-btn" @click="closeSearchHistoryModal">×</button>
        </div>
        <div class="modal-body search-history-body">
          <!-- 搜索框 -->
          <div class="search-history-search">
            <input 
              v-model="searchHistoryKeyword" 
              type="text" 
              placeholder="搜索聊天记录..."
              class="search-history-input"
              @input="handleSearchHistoryInput"
            />
          </div>
          
          <!-- 筛选按钮 -->
          <div class="search-history-filters">
            <button 
              :class="['filter-btn', { active: searchHistoryFilter === 'all' }]"
              @click="setSearchHistoryFilter('all')"
            >
              全部
            </button>
            <button 
              :class="['filter-btn', { active: searchHistoryFilter === 'image' }]"
              @click="setSearchHistoryFilter('image')"
            >
              图片
            </button>
            <button 
              :class="['filter-btn', { active: searchHistoryFilter === 'file' }]"
              @click="setSearchHistoryFilter('file')"
            >
              文件
            </button>
            <div class="date-filter-wrapper" ref="dateFilterWrapper">
              <button 
                :class="['filter-btn', { active: selectedDate !== null }]"
                @click="toggleDatePicker"
              >
                日期
              </button>
              <!-- 日期选择器 - 显示在按钮下方 -->
              <div v-if="showDatePicker" class="date-picker-dropdown" ref="datePickerDropdown">
                <div class="date-picker-header">
                  <button @click="changeDateMonth(-1)" class="date-nav-btn">‹</button>
                  <select v-model="selectedYear" @change="handleDateSelectChange" class="date-select">
                    <option v-for="year in availableYears" :key="year" :value="year">{{ year }}年</option>
                  </select>
                  <select v-model="selectedMonth" @change="handleDateSelectChange" class="date-select">
                    <option v-for="month in 12" :key="month" :value="month">{{ month }}月</option>
                  </select>
                  <button @click="changeDateMonth(1)" class="date-nav-btn">›</button>
                </div>
                <div class="date-picker-calendar">
                  <div class="date-picker-weekdays">
                    <div v-for="day in ['日', '一', '二', '三', '四', '五', '六']" :key="day" class="weekday">{{ day }}</div>
                  </div>
                  <div class="date-picker-days">
                    <div 
                      v-for="day in calendarDays" 
                      :key="day.date"
                      :class="['date-day', { 
                        'has-message': day.hasMessage, 
                        'selected': day.selected,
                        'other-month': day.otherMonth
                      }]"
                      @click="selectDate(day)"
                    >
                      {{ day.day }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- 聊天记录列表 -->
          <div class="search-history-list">
            <div v-if="searchHistoryLoading" class="search-history-loading">加载中...</div>
            <div v-else-if="searchHistoryMessages.length === 0" class="search-history-empty">
              暂无聊天记录
            </div>
            <div 
              v-else
              v-for="msg in searchHistoryMessages" 
              :key="msg.id"
              class="search-history-item"
            >
              <div 
                class="search-history-avatar"
                :class="{ 'ai-friend-avatar': msg.sender_id === 0 || msg.nickname === 'AI好友' || (currentChatInfo?.type === 'ai_friend' && msg.sender_id !== props.user.id) }"
                :style="msg.avatar && !(msg.sender_id === 0 || msg.nickname === 'AI好友' || (currentChatInfo?.type === 'ai_friend' && msg.sender_id !== props.user.id)) ? { backgroundImage: `url(${getImageUrl(msg.avatar)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}"
              >
                <span v-if="msg.sender_id === 0 || msg.nickname === 'AI好友' || (currentChatInfo?.type === 'ai_friend' && msg.sender_id !== props.user.id)">🤖</span>
                <span v-else-if="!msg.avatar">{{ msg.nickname?.charAt(0) || 'U' }}</span>
              </div>
              <div class="search-history-content">
                <div class="search-history-sender">{{ msg.nickname || '用户' }}</div>
                <div v-if="msg.media_type === 'text'" class="search-history-text">{{ msg.content }}</div>
                <div v-else-if="msg.media_type === 'image'" class="search-history-image">
                  <img :src="getImageUrl(msg.content)" alt="图片" @click="previewImage(msg.content)" />
                </div>
                <div v-else-if="msg.media_type === 'file'" class="search-history-file">
                  <div class="file-link" @click="downloadFile(msg.content, msg.media_type)">📎 {{ getFileName(msg.content) }}</div>
                  <span v-if="msg.file_size" class="file-size">{{ msg.file_size }}</span>
                </div>
              </div>
              <div class="search-history-time">{{ msg.created_at }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 群公告对话框 -->
    <div v-if="showAnnouncementModal" class="modal-overlay" @click.self="closeAnnouncementModal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>群公告</h3>
          <button class="modal-close-btn" @click="closeAnnouncementModal">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <textarea
              v-model="announcementContent"
              placeholder="请输入群公告内容..."
              class="announcement-textarea"
              rows="10"
            ></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="closeAnnouncementModal" class="modal-btn cancel-btn">取消</button>
          <button @click="saveAnnouncement" class="modal-btn confirm-btn" :disabled="publishingAnnouncement">
            保存
          </button>
        </div>
      </div>
    </div>

    <!-- 确认发布群公告对话框 -->
    <div v-if="showAnnouncementPublishConfirm" class="modal-overlay" @click.self="showAnnouncementPublishConfirm = false">
      <div class="modal-content">
        <div class="modal-header">
          <h3>确认发布</h3>
        </div>
        <div class="modal-body">
          <p>该公告会通知全部群成员，是否发布？</p>
        </div>
        <div class="modal-footer">
          <button @click="showAnnouncementPublishConfirm = false" class="modal-btn cancel-btn">取消</button>
          <button @click="publishAnnouncement" class="modal-btn confirm-btn" :disabled="publishingAnnouncement">
            {{ publishingAnnouncement ? '发布中...' : '发布' }}
          </button>
        </div>
      </div>
    </div>

    <!-- AI推荐原因对话框 -->
    <div v-if="showAIReasonModal" class="modal-overlay">
      <div class="modal-content ai-reason-modal">
        <div class="modal-header">
          <h3>AI推荐原因</h3>
          <button class="modal-close-btn" @click="closeAIReasonModal">×</button>
        </div>
        <div class="modal-body">
          <div v-if="selectedRecommendationForReason" class="recommendation-user-info">
            <div 
              class="recommendation-avatar"
              :style="selectedRecommendationForReason.avatar ? { backgroundImage: `url(${getImageUrl(selectedRecommendationForReason.avatar)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}"
            >
              <span v-if="!selectedRecommendationForReason.avatar">{{ (selectedRecommendationForReason.name || selectedRecommendationForReason.username || 'U')?.charAt(0) }}</span>
            </div>
            <div class="recommendation-user-details">
              <div class="recommendation-user-name">{{ selectedRecommendationForReason.name || selectedRecommendationForReason.username || '用户' }}</div>
              <div class="recommendation-user-meta">
                <span v-if="selectedRecommendationForReason.common_interests > 0">共同兴趣 {{ selectedRecommendationForReason.common_interests }} 个</span>
                <span v-if="selectedRecommendationForReason.common_groups > 0">共同群聊 {{ selectedRecommendationForReason.common_groups }} 个</span>
              </div>
            </div>
          </div>
          <div class="ai-reason-content">
            <div v-if="loadingAIReason" class="loading-ai-reason">
              <div class="loading-spinner"></div>
              <div>AI正在分析推荐原因...</div>
            </div>
            <div v-else-if="aiRecommendationReason" class="ai-reason-text">
              {{ aiRecommendationReason }}
            </div>
            <div v-else-if="aiReasonError" class="ai-reason-error">
              {{ aiReasonError }}
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="closeAIReasonModal" class="modal-btn primary-btn">关闭</button>
        </div>
      </div>
    </div>

    <!-- 好友申请对话框 -->
    <div v-if="showFriendRequestModal" class="modal-overlay">
      <div class="modal-content friend-request-modal">
        <div class="modal-header">
          <h3>申请添加好友</h3>
          <button class="modal-close-btn" @click="closeFriendRequestModal">×</button>
        </div>
        <div class="modal-body">
          <div v-if="selectedFriendRequestUser" class="friend-request-summary">
            <div 
              class="friend-request-avatar"
              :style="selectedFriendRequestUser.avatar ? { backgroundImage: `url(${getImageUrl(selectedFriendRequestUser.avatar)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}"
            >
              <span v-if="!selectedFriendRequestUser.avatar">{{ (selectedFriendRequestUser.name || selectedFriendRequestUser.username || 'U')?.charAt(0) }}</span>
            </div>
            <div class="friend-request-summary-info">
              <div class="friend-request-name">{{ selectedFriendRequestUser.name || selectedFriendRequestUser.username || '用户' }}</div>
              <div class="friend-request-meta">用户名：{{ selectedFriendRequestUser.username || '-' }}</div>
              <div class="friend-request-meta">邮箱：{{ selectedFriendRequestUser.email || '-' }}</div>
            </div>
          </div>
          <div class="form-group">
            <label>打招呼内容 <span class="required">*</span></label>
            <textarea
              v-model="friendRequestGreeting"
              ref="friendRequestGreetingRef"
              class="modal-textarea"
              maxlength="100"
              placeholder="请输入要发送给对方的打招呼内容"
              :disabled="sendingFriendRequest"
            ></textarea>
            <div class="form-hint">向对方介绍自己，最多100个字符。</div>
          </div>
          <div class="form-group">
            <label>备注</label>
            <input
              v-model="friendRequestRemark"
              class="modal-input"
              maxlength="20"
              placeholder="通过后在好友列表中显示的备注，可留空"
              :disabled="sendingFriendRequest"
            />
            <div class="form-hint">备注仅自己可见，可在通过后再次修改。</div>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="closeFriendRequestModal" class="modal-btn cancel-btn" :disabled="sendingFriendRequest">取消</button>
          <button @click="submitFriendRequest" class="modal-btn confirm-btn" :disabled="sendingFriendRequest || !friendRequestGreeting.trim()">发送</button>
        </div>
      </div>
    </div>

    <!-- 消息提示 Toast -->
    <div v-if="toastMessage" class="toast" :class="{ 'toast-success': toastType === 'success', 'toast-error': toastType === 'error' }">
      {{ toastMessage }}
    </div>
  </div>

</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick, watch, onBeforeUnmount, computed } from 'vue'
import { auth, friend, group, messagesApi, deepseek, aiFriend, clearToken, setApiBaseUrl, setToken, initApiUrl, getApiBaseUrl } from '../api/client'
import ImageCropper from './ImageCropper.vue'

const emits = defineEmits(['logout', 'update-user'])

const props = defineProps({ user: Object })

const currentTab = ref('chat')
const favoriteCategory = ref('all') // 收藏夹分类：all, image, file, message
const favoritesList = ref([]) // 收藏列表
const chatList = ref([])
const friendList = ref([])
const friendRecommendations = ref([])

// 检查是否有AI推荐
const hasAIRecommendation = computed(() => {
  return friendRecommendations.value.some(rec => rec.recommended_by_ai === true)
})

// AI推荐原因相关
const showAIReasonModal = ref(false)
const selectedRecommendationForReason = ref(null)
const aiRecommendationReason = ref('')
const loadingAIReason = ref(false)
const aiReasonError = ref('')
const currentRoom = ref(null)
const currentChatInfo = ref(null)
const messages = ref([])
const inputMessage = ref('')
const ws = ref(null)
const searchKeyword = ref('')
const showAddFriend = ref(false)
const searchUsername = ref('')
const searchResults = ref([])
const searchError = ref('')
const searchAttempted = ref(false)
const searchUsernameInputRef = ref(null)
const pendingOutgoingUserIds = ref([])
const pendingIncomingUserIds = ref([])
const sentFriendRequests = ref([])
const receivedFriendRequests = ref([])
const previousSentRequestStatuses = ref({})
const previousReceivedRequestIds = ref(new Set())
const showFriendRequestModal = ref(false)
const selectedFriendRequestUser = ref(null)
const friendRequestGreeting = ref('')
const friendRequestRemark = ref('')
const friendRequestGreetingRef = ref(null)
const sendingFriendRequest = ref(false)
const processingRequestIds = ref([])
const friendRequestsLoadedOnce = ref(false)
const messagesContainer = ref(null)
const fileInput = ref(null)
const imageInput = ref(null)
const messageInputRef = ref(null)
const avatarInput = ref(null)
const showCropper = ref(false)
const cropperImageSrc = ref('')

// @功能相关
const showMentionPicker = ref(false)
const mentionPickerSelectedIndex = ref(0)
const mentionPickerStyle = ref({ top: '0px', left: '0px' })
const mentionStartPos = ref(0) // @符号在输入框中的位置
const mentionPickerItems = ref([])
const showEmojiPicker = ref(false)
const currentEmojiCategory = ref('smileys')
const showNicknameDialog = ref(false)
const editingNickname = ref('')
const nicknameInputRef = ref(null)
const showUsernameDialog = ref(false)
const editingUsername = ref('')
const usernameInputRef = ref(null)
const usernamePassword = ref('')
const usernamePasswordInputRef = ref(null)
const usernameError = ref('')
const usernameExistsError = ref('')
const usernamePasswordError = ref('')
const checkingUsername = ref(false)
const showUsernameForgetPassword = ref(false)
const usernameForgetEmail = ref('')
const usernameForgetCode = ref('')
const usernameNewPassword = ref('')
const usernameForgetPasswordError = ref('')
const usernameCodeSending = ref(false)
const usernameCountdown = ref(0)
let usernameCountdownTimer = null
let friendRequestPollingTimer = null
let chatListPollingTimer = null
const showUserInfoDialog = ref(false)
const selectedUserInfo = ref({ id: null, username: '', name: '', avatar: '', email: '', remark: '', is_friend: false, isAIFriend: false })
const selectedFriendRequest = ref(null)
// 右侧显示内容类型：'chat' | 'userInfo' | 'groupInfo'
const rightPanelView = ref('chat')
// 选中的好友ID（用于显示阴影效果）
const selectedFriendId = ref(null)
// 选中的群聊ID（用于显示阴影效果）
const selectedGroupId = ref(null)
const isEditingRemark = ref(false)
const editingRemark = ref('')
const remarkInputRef = ref(null)
// AI好友设置相关
const isEditingUserNickname = ref(false)
const editingUserNickname = ref('')
const userNicknameInputRef = ref(null)
const isEditingAIName = ref(false)
const editingAIName = ref('')
const aiNameInputRef = ref(null)
const selectedAIFriendType = ref('warm')
const toastMessage = ref('')
const toastType = ref('success') // 'success' or 'error'
const selectedFriendRequestIsIncoming = ref(false)
const showContextMenu = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const selectedMessage = ref(null)
const showForwardModal = ref(false)
const forwardMessage = ref(null)
const forwardTarget = ref(null)
const deletedMessageIds = ref(new Set()) // 存储已删除的消息ID

// 多选消息转发相关
const isMultiSelectMode = ref(false)
const selectedMessages = ref(new Set()) // 存储选中的消息ID
const showMultiForwardModal = ref(false)
const multiForwardTarget = ref(null)

// 转发消息详情弹窗
const showForwardMessagesDetailModal = ref(false)
const forwardMessagesDetailTitle = ref('')
const forwardMessagesDetailList = ref([])
// 转发消息详情弹窗栈，用于管理多层级嵌套
const forwardMessagesDetailStack = ref([])

// 查找聊天记录相关
const showSearchHistoryModal = ref(false)
const searchHistoryKeyword = ref('')
const searchHistoryFilter = ref('all') // all, image, file
const searchHistoryMessages = ref([])
const searchHistoryLoading = ref(false)
const searchHistoryDates = ref([]) // 有消息的日期列表
const showDatePicker = ref(false)
const selectedYear = ref(new Date().getFullYear())
const selectedMonth = ref(new Date().getMonth() + 1)
const selectedDate = ref(null) // 选中的日期 YYYY-MM-DD
const calendarDays = ref([])
const showChatContextMenu = ref(false)
const chatContextMenuPosition = ref({ x: 0, y: 0 })
const selectedChatItem = ref(null)

// 收藏项右键菜单相关
const showFavoriteContextMenu = ref(false)
const favoriteContextMenuPosition = ref({ x: 0, y: 0 })
const selectedFavoriteItem = ref(null)

// 选择收藏弹窗相关
const showSelectFavoriteModal = ref(false)
const selectedFavoritesForSend = ref(new Set()) // 存储选中的收藏项ID

// 推荐回复相关
const suggestedReplies = ref([]) // 推荐回复列表
const isGeneratingReply = ref(false) // 是否正在生成推荐回复
const lastMessageForSuggestion = ref(null) // 最后一条用于生成推荐的消息ID，避免重复生成

// 发起群聊相关
const showCreateGroupModal = ref(false)
const createGroupSearchKeyword = ref('')
const createGroupName = ref('')
const createGroupAvatar = ref('')
const selectedContacts = ref(new Set())
const allContacts = ref([])
const filteredCreateGroupContacts = ref([])
const creatingGroup = ref(false)
const groupAvatarInput = ref(null)
const showGroupAvatarCropper = ref(false)
const groupAvatarCropperSrc = ref('')
const groupAvatarFile = ref(null)

// 群聊信息相关
const showGroupInfoModal = ref(false)
const groupInfo = ref({})
const groupMembers = ref([])
const groupMemberSearchKeyword = ref('')
const filteredGroupMembers = ref([])
const groupRemark = ref('') // 用户对群聊的个人备注
const myGroupNickname = ref('') // 我在群内的昵称
const editingGroupName = ref(false)
const editingGroupNameValue = ref('')
const editingGroupRemark = ref(false)
const editingGroupRemarkValue = ref('')
const editingGroupNickname = ref(false)
const editingGroupNicknameValue = ref('')
const groupNameInput = ref(null)
const groupRemarkInput = ref(null)
const groupNicknameInput = ref(null)
const groupNameEditRef = ref(null)
const groupRemarkEditRef = ref(null)
const groupNicknameEditRef = ref(null)
const groupInfoAvatarInput = ref(null)

// 群公告相关
const showAnnouncementModal = ref(false)
const announcementContent = ref('')
const showAnnouncementPublishConfirm = ref(false)
const publishingAnnouncement = ref(false)
const showGroupInfoAvatarCropper = ref(false)
const groupInfoAvatarCropperSrc = ref('')
const groupInfoAvatarFile = ref(null)
const showLeaveGroupConfirm = ref(false)
const showDisbandGroupConfirm = ref(false)
const disbandingGroup = ref(false)
const showDeleteChatConfirm = ref(false)
const deletingChat = ref(false)
const deleteChatName = ref('')
const deleteChatRoom = ref(null)
const deleteChatItem = ref(null)
const showAddGroupMemberModal = ref(false)
const addMemberSearchKeyword = ref('')
const allAddMemberContacts = ref([])
const filteredAddMemberContacts = ref([])
const selectedAddMembers = ref(new Set())
const addingMembers = ref(false)

// 移除成员相关
const showRemoveGroupMemberModal = ref(false)
const removeMemberSearchKeyword = ref('')
const filteredRemoveMembers = ref([])
const selectedRemoveMembers = ref(new Set())
const removingMembers = ref(false)
const showRemoveMemberConfirm = ref(false)
const pendingRemoveMemberId = ref(null)
const pendingRemoveMemberDisplayName = ref('')

// 群管理相关
const showGroupManagementModal = ref(false)
const showTransferOwnershipModal = ref(false)
const transferOwnershipSearchKeyword = ref('')
const filteredTransferOwnershipMembers = ref([])
const selectedNewOwner = ref(null)
const transferringOwnership = ref(false)

// 群管理员相关
const showGroupAdminModal = ref(false)
const groupAdmins = ref([])
const loadingAdmins = ref(false)
const showSelectAdminMembersModal = ref(false)
const selectAdminMembersSearchKeyword = ref('')
const filteredSelectAdminMembers = ref([])
const selectedAdminMembers = ref(new Set())
const addingAdmins = ref(false)
const showRemoveAdminConfirm = ref(false)
const removingAdmin = ref(false)
const adminToRemove = ref(null)

// 免打扰图标路径
const muteIconPath = ref('/electron/resource/images/messageDoNotDisturb.svg')

// @所有人图标路径
const allPeopleIconPath = ref('/electron/resource/images/allPeople.svg')

// 文件图标路径
const fileIconPath = ref('/electron/resource/images/file.svg')

// 图片图标路径
const imageIconPath = ref('/electron/resource/images/image.svg')

// 表情图标路径
const expressionIconPath = ref('/electron/resource/images/expression.svg')

// 删除好友相关
const showDeleteFriendConfirm = ref(false)
const deleteFriendName = ref('')
const pendingDeleteFriendId = ref(null)

// 设置弹窗相关
const showSettingsModal = ref(false)
// AI好友相关
const showAIFriendTypeModal = ref(false)
const aiFriendTypes = [
  { value: 'warm', name: '温暖倾听型', description: '善于安慰和陪伴' },
  { value: 'humorous', name: '幽默开朗型', description: '总能逗你开心' },
  { value: 'rational', name: '理性分析型', description: '帮你客观分析问题' },
  { value: 'energetic', name: '活力鼓励型', description: '给你正能量打气' }
]
const aiFriendWs = ref(null) // AI好友的WebSocket连接
const isAIFriendChat = ref(false) // 当前是否是AI好友聊天
const settingsCurrentTab = ref('signature')
const editingSignature = ref('')
const selectedInterests = ref([])
const showMoreTags = ref(false)
const interestSearchQuery = ref('')
const expandedCategories = ref([])

// 兴趣爱好分类（标签可以属于多个分类）
const interestCategories = [
  {
    icon: '🎮',
    name: '游戏电竞',
    tags: ['手游', '主机游戏', 'PC游戏', '电竞', '游戏开发', '游戏策划', '游戏运营', '游戏剧情', '独立游戏', '卡牌游戏', '策略游戏', 'RPG', 'MOBA', 'FPS', '沙盒游戏']
  },
  {
    icon: '🎬',
    name: '影视娱乐',
    tags: ['电影', '电视剧', '综艺', '动漫', '纪录片', '短视频', '直播', '自媒体', '网红', 'KOL', 'MCN', '影视评论', '追剧', '影评']
  },
  {
    icon: '📚',
    name: '阅读写作',
    tags: ['读书', '文学', '小说', '诗歌', '写作', '出版', '阅读', '书评', '历史', '哲学', '心理学', '社会学', '经济学', '政治', '法律', '游戏剧情']
  },
  {
    icon: '🎵',
    name: '音乐',
    tags: ['音乐', '流行音乐', '古典音乐', '摇滚', '民谣', '电子音乐', '说唱', '爵士', '演唱会', '音乐制作', '乐器', '钢琴', '吉他', '小提琴']
  },
  {
    icon: '🍔',
    name: '美食',
    tags: ['美食', '烹饪', '烘焙', '咖啡', '茶艺', '酒类', '探店', '美食摄影', '素食', '健康饮食', '地方菜', '西餐', '日料', '中餐']
  },
  {
    icon: '🏃',
    name: '运动健身',
    tags: ['运动', '健身', '瑜伽', '跑步', '篮球', '足球', '网球', '羽毛球', '乒乓球', '游泳', '登山', '骑行', '滑雪', '潜水', '冲浪', '钓鱼', '露营', '徒步', '自驾', '马拉松', '力量训练', '有氧运动']
  },
  {
    icon: '📷',
    name: '摄影',
    tags: ['摄影', '人像摄影', '风景摄影', '街拍', '航拍', '美食摄影', '旅行摄影', '摄影后期', '相机', '镜头', '摄影技巧']
  },
  {
    icon: '✈️',
    name: '旅行',
    tags: ['旅行', '自由行', '背包客', '自驾游', '出境游', '国内游', '旅行攻略', '旅行摄影', '民宿', '酒店', '景点', '文化体验']
  },
  {
    icon: '💻',
    name: '科技',
    tags: ['科技', '编程', '设计', '人工智能', '机器学习', '深度学习', '区块链', '云计算', '大数据', '物联网', '5G', 'VR', 'AR', '元宇宙', '算法', '数据', '技术', '研发', '测试', '运维', '安全', '产品', '运营']
  },
  {
    icon: '💰',
    name: '理财',
    tags: ['理财', '投资', '股票', '基金', '保险', '创业', '金融', '会计', '审计', '咨询', '管理', '销售', '营销', '电商', '跨境电商', '新零售', 'O2O']
  },
  {
    icon: '🎨',
    name: '艺术',
    tags: ['艺术', '绘画', '书法', '舞蹈', '戏剧', '展览', '博物馆', '收藏', '手工', '设计', '时尚', '服装', '珠宝', '艺术品']
  },
  {
    icon: '🐾',
    name: '宠物',
    tags: ['宠物', '养猫', '养狗', '宠物护理', '宠物训练', '宠物摄影', '小动物', '宠物用品']
  },
  {
    icon: '🌱',
    name: '生活',
    tags: ['园艺', '家居', '装修', '收纳', '生活技巧', '健康', '养生', '冥想', '正念', '时间管理', '效率', '极简主义']
  },
  {
    icon: '🎓',
    name: '学习',
    tags: ['教育', '学习', '科学', '数学', '物理', '化学', '生物', '地理', '天文', '医学', '新闻', '媒体', '广告', '人力资源', '客服', '语言学习', '在线教育']
  }
]

// 获取所有标签（去重）
const allInterestTags = computed(() => {
  const tagSet = new Set()
  interestCategories.forEach(category => {
    category.tags.forEach(tag => tagSet.add(tag))
  })
  return Array.from(tagSet).sort()
})

// 根据搜索查询过滤标签
const filteredTags = computed(() => {
  if (!interestSearchQuery.value.trim()) {
    return []
  }
  const query = interestSearchQuery.value.toLowerCase().trim()
  return allInterestTags.value.filter(tag => 
    tag.toLowerCase().includes(query)
  )
})

// 切换分类展开/收起
const toggleCategory = (categoryName) => {
  const index = expandedCategories.value.indexOf(categoryName)
  if (index > -1) {
    expandedCategories.value.splice(index, 1)
  } else {
    expandedCategories.value.push(categoryName)
  }
}

// 切换兴趣爱好标签
const toggleInterest = (tag) => {
  const index = selectedInterests.value.indexOf(tag)
  if (index > -1) {
    selectedInterests.value.splice(index, 1)
  } else {
    selectedInterests.value.push(tag)
  }
}

// 保存个性签名
const saveSignature = async () => {
  const signature = editingSignature.value.trim()
  
  try {
    const data = await auth.updateSignature(signature)
    if (data.code === 200) {
      const updatedSignature = data.data?.signature || data.data?.user?.signature || signature
      
      // 更新本地用户信息
      const updatedUser = {
        ...props.user,
        signature: updatedSignature
      }
      emits('update-user', updatedUser)
      
      // 如果当前正在查看自己的用户信息，同步更新 selectedUserInfo
      if (selectedUserInfo.value && selectedUserInfo.value.id === props.user.id) {
        selectedUserInfo.value.signature = updatedSignature
      }
      
      showToast('个性签名更新成功', 'success')
    } else {
      showToast(data.message || '个性签名更新失败', 'error')
    }
  } catch (e) {
    console.error('更新个性签名失败:', e)
    showToast('个性签名更新失败，请重试', 'error')
  }
}

// 保存兴趣爱好
const saveInterests = async () => {
  // 将数组转换为逗号分隔的字符串发送给后端
  const interests = selectedInterests.value.join(',')
  
  try {
    const data = await auth.updateInterests(interests)
    if (data.code === 200) {
      // 后端返回的interests可能是JSON数组字符串，需要解析
      let updatedInterests = data.data?.interests || data.data?.user?.interests || interests
      
      // 如果返回的是JSON字符串，解析它；如果是数组，转换为字符串
      if (typeof updatedInterests === 'string') {
        try {
          const parsed = JSON.parse(updatedInterests)
          if (Array.isArray(parsed)) {
            updatedInterests = parsed.join(',')
          }
        } catch (e) {
          // 如果不是JSON格式，说明已经是逗号分隔的字符串，直接使用
        }
      } else if (Array.isArray(updatedInterests)) {
        updatedInterests = updatedInterests.join(',')
      }
      
      // 更新本地用户信息
      const updatedUser = {
        ...props.user,
        interests: updatedInterests
      }
      emits('update-user', updatedUser)
      
      // 如果当前正在查看自己的用户信息，同步更新 selectedUserInfo
      if (selectedUserInfo.value && selectedUserInfo.value.id === props.user.id) {
        selectedUserInfo.value.interests = updatedInterests
      }
      
      showToast('兴趣爱好更新成功', 'success')
    } else {
      showToast(data.message || '兴趣爱好更新失败', 'error')
    }
  } catch (e) {
    console.error('更新兴趣爱好失败:', e)
    showToast('兴趣爱好更新失败，请重试', 'error')
  }
}

// 将interests转换为数组（处理JSON数组字符串或逗号分隔字符串）
const getInterestsArray = (interests) => {
  if (!interests) return []
  if (typeof interests === 'string') {
    try {
      const parsed = JSON.parse(interests)
      if (Array.isArray(parsed)) {
        return parsed.filter(t => t && t.trim())
      }
    } catch (e) {
      // 不是JSON格式，按逗号分隔字符串处理
    }
    return interests.split(',').filter(t => t.trim())
  } else if (Array.isArray(interests)) {
    return interests.filter(t => t && t.trim())
  }
  return []
}

const blacklist = ref([])

// 拉黑好友相关
const showBlockFriendConfirm = ref(false)
const showUnblockFriendConfirm = ref(false)
const showClearContextConfirm = ref(false)
const blockFriendDisplayName = computed(() => {
  if (!selectedUserInfo.value) return ''
  return selectedUserInfo.value.remark || selectedUserInfo.value.name || selectedUserInfo.value.username || '好友'
})

onMounted(async () => {
  // 初始化API地址
  await initApiUrl()
  
  // 初始化图标路径（Electron 环境）
  if (window.electronAPI && window.electronAPI.getResourcePath) {
    try {
      const mutePath = await window.electronAPI.getResourcePath('images/messageDoNotDisturb.svg')
      muteIconPath.value = mutePath
    } catch (e) {
      console.error('获取免打扰图标路径失败:', e)
    }
    try {
      const allPeoplePath = await window.electronAPI.getResourcePath('images/allPeople.svg')
      allPeopleIconPath.value = allPeoplePath
    } catch (e) {
      console.error('获取@所有人图标路径失败:', e)
    }
    try {
      const filePath = await window.electronAPI.getResourcePath('images/file.svg')
      fileIconPath.value = filePath
    } catch (e) {
      console.error('获取文件图标路径失败:', e)
    }
    try {
      const imagePath = await window.electronAPI.getResourcePath('images/image.svg')
      imageIconPath.value = imagePath
    } catch (e) {
      console.error('获取图片图标路径失败:', e)
    }
    try {
      const expressionPath = await window.electronAPI.getResourcePath('images/expression.svg')
      expressionIconPath.value = expressionPath
    } catch (e) {
      console.error('获取表情图标路径失败:', e)
    }
  }
  
  // 如果从Electron或window获取了地址，保存它
  if (window.electronAPI?.getApiUrl) {
    const apiUrl = await window.electronAPI.getApiUrl()
    if (apiUrl) {
      setApiBaseUrl(apiUrl)
    }
  } else if (window.API_BASE_URL) {
    setApiBaseUrl(window.API_BASE_URL)
  }
  
  // 等待一小段时间确保token已保存
  await nextTick()
  
  // 检查token是否存在
  const token = localStorage.getItem('token')
  if (!token) {
    console.warn('ChatRoom加载时没有token，可能还未登录')
    return
  }
  
  console.log('ChatRoom开始加载数据，token前20字符:', token.substring(0, 20) + '...')
  console.log('当前API地址:', getApiBaseUrl())
  // 并行加载所有数据，提高加载速度
  await Promise.all([
    loadChatList(),
    loadFriendList(),
    loadGroupChatListForContact(), // 加载通讯录选项卡下的群聊列表
    loadFriendRequests()
  ])
  
  // 启动好友申请状态轮询定时器（每5秒检查一次）
  friendRequestPollingTimer = setInterval(() => {
    loadFriendRequests()
  }, 5000)
  
  // 启动聊天列表轮询定时器（每3秒检查一次，确保及时更新最新消息）
  chatListPollingTimer = setInterval(() => {
    loadChatList()
  }, 3000)
  
  // 添加点击外部区域关闭编辑状态的事件监听
  document.addEventListener('click', handleClickOutsideEdit)
})

// 监听模态框状态，确保关闭后释放焦点
watch([showAddFriend, showUserInfoDialog, showNicknameDialog, showUsernameDialog, showFriendRequestModal], ([addFriend, userInfo, nickname, username, friendRequest]) => {
  if (!addFriend && !userInfo && !nickname && !username && !friendRequest) {
    // 所有模态框都关闭后，强制释放所有输入框焦点
    setTimeout(() => {
      // 释放所有可能的输入框焦点
      const inputs = document.querySelectorAll('input, textarea')
      inputs.forEach(input => {
        if (document.activeElement === input) {
          input.blur()
        }
      })
      // 让 window 获得焦点
      if (window) {
        window.focus()
      }
      // 确保 body 可以接收焦点
      if (document.body) {
        document.body.setAttribute('tabindex', '-1')
        document.body.focus()
        document.body.removeAttribute('tabindex')
      }
    }, 100)
  }
})

// 处理通讯录选项卡点击
const handleContactTabClick = async () => {
  currentTab.value = 'contact'
  
  // 先立即更新右侧面板视图，不等待异步操作
  // 如果当前有打开的聊天，显示对应的信息
  if (currentChatInfo.value && currentRoom.value) {
    const chatInfo = currentChatInfo.value
    
    // 如果是AI好友聊天，切换到通讯录时显示空状态提示
    if (chatInfo.type === 'ai_friend' || chatInfo.chat_type === 'ai_friend') {
      // 清空当前聊天信息，显示空状态
      currentRoom.value = null
      currentChatInfo.value = null
      isAIFriendChat.value = false
      messages.value = []
      rightPanelView.value = 'chat'
      selectedFriendId.value = null
      selectedGroupId.value = null
      // 关闭AI好友WebSocket连接
      if (aiFriendWs.value) {
        aiFriendWs.value.close()
        aiFriendWs.value = null
      }
      // 异步加载好友推荐，不阻塞UI
      loadFriendRecommendations()
      return
    }
    
    // 如果是群聊，显示群聊信息
    if (chatInfo.type === 'group' && chatInfo.group_id) {
      selectedGroupId.value = chatInfo.group_id
      selectedFriendId.value = null
      rightPanelView.value = 'groupInfo'
      // 异步加载群聊信息，不阻塞UI
      showGroupInfoInRightPanel(chatInfo.group_id)
      // 异步加载好友推荐，不阻塞UI
      loadFriendRecommendations()
      return
    } 
    // 如果是私聊，显示好友信息
    else if (chatInfo.type === 'private' && chatInfo.user_id) {
      // 从好友列表中查找该好友
      const friend = friendList.value
        .flatMap(group => group.friend || [])
        .find(f => f.user_id === chatInfo.user_id)
      
      if (friend) {
        selectedFriendId.value = friend.user_id
        selectedGroupId.value = null
        rightPanelView.value = 'userInfo'
        // 异步加载用户信息，不阻塞UI
        loadUserInfoForRightPanel(
          friend.user_id, 
          friend.avatar, 
          friend.remark || friend.name || friend.username
        )
        // 异步加载好友推荐，不阻塞UI
        loadFriendRecommendations()
        return
      }
    }
  }
  
  // 如果没有打开的聊天，显示空状态
  currentRoom.value = null
  currentChatInfo.value = null
  isAIFriendChat.value = false
  messages.value = []
  rightPanelView.value = 'chat'
  selectedFriendId.value = null
  selectedGroupId.value = null
  
  // 异步加载好友推荐，不阻塞UI
  loadFriendRecommendations()
}

watch(currentTab, (newVal) => {
  if (newVal === 'contact') {
    loadFriendRequests()
    loadFriendRecommendations()
  } else if (newVal === 'favorites') {
    loadFavorites()
  }
})

watch(favoriteCategory, () => {
  // 分类切换时，可以在这里做额外处理
})

// 显示 Toast 消息提示（不阻塞，不会导致焦点问题）
const showToast = (message, type = 'success') => {
  toastMessage.value = message
  toastType.value = type
  // 3秒后自动隐藏
  setTimeout(() => {
    toastMessage.value = ''
  }, 3000)
}

// 获取匹配的字段（用于显示匹配提示）
const getMatchField = (item) => {
  if (!searchKeyword.value.trim()) {
    return ''
  }
  
  const keyword = searchKeyword.value.trim().toLowerCase()
  
  // 获取用户名（优先使用从user表获取的最新username，否则使用receiver_username）
  const username = item.username || item.receiver_username || ''
  
  // 获取邮箱
  const email = item.email || ''
  
  // 获取原始昵称（后端返回的 nickname 字段，如果没有则使用 name）
  // 注意：如果设置了备注，item.name 是备注，所以需要单独获取昵称
  const nickname = item.nickname || (item.remark ? null : item.name) || ''
  
  // 获取显示名称（优先备注，然后是昵称，最后是用户名）
  const displayName = item.remark || item.name || username || ''
  
  // 检查是否直接匹配显示名称
  const matchDisplayName = displayName.toLowerCase().includes(keyword)
  
  // 如果直接匹配显示名称，不显示匹配字段
  if (matchDisplayName) {
    return ''
  }
  
  // 检查备注、昵称、用户名、邮箱是否包含搜索关键词
  const matchRemark = item.remark && item.remark.toLowerCase().includes(keyword)
  const matchNickname = nickname && nickname.toLowerCase().includes(keyword)
  const matchUsername = username && username.toLowerCase().includes(keyword)
  const matchEmail = email && email.toLowerCase().includes(keyword)
  
  // 返回第一个匹配的字段
  if (matchRemark) {
    return `备注：${item.remark}`
  } else if (matchNickname) {
    return `昵称：${nickname}`
  } else if (matchUsername) {
    return `用户名：${username}`
  } else if (matchEmail) {
    return `邮箱：${email}`
  }
  
  return ''
}

// 获取好友匹配的字段（用于显示匹配提示）
const getFriendMatchField = (friend) => {
  if (!searchKeyword.value.trim()) {
    return ''
  }
  
  const keyword = searchKeyword.value.trim().toLowerCase()
  
  // 获取备注、昵称、用户名、邮箱
  const remark = friend.remark || ''
  const nickname = friend.name || ''
  const username = friend.username || ''
  const email = friend.email || ''
  
  // 获取显示名称（优先备注，然后是昵称，最后是用户名）
  const displayName = remark || nickname || username || ''
  
  // 检查是否直接匹配显示名称
  const matchDisplayName = displayName.toLowerCase().includes(keyword)
  
  // 如果直接匹配显示名称，不显示匹配字段
  if (matchDisplayName) {
    return ''
  }
  
  // 检查备注、昵称、用户名、邮箱是否包含搜索关键词
  const matchRemark = remark && remark.toLowerCase().includes(keyword)
  const matchNickname = nickname && nickname.toLowerCase().includes(keyword)
  const matchUsername = username && username.toLowerCase().includes(keyword)
  const matchEmail = email && email.toLowerCase().includes(keyword)
  
  // 返回第一个匹配的字段
  if (matchRemark) {
    return `备注：${remark}`
  } else if (matchNickname) {
    return `昵称：${nickname}`
  } else if (matchUsername) {
    return `用户名：${username}`
  } else if (matchEmail) {
    return `邮箱：${email}`
  }
  
  return ''
}

// 过滤聊天列表：根据搜索关键词匹配备注、昵称或用户名
// 检查是否有AI好友
const hasAIFriend = computed(() => {
  return chatList.value.some(item => item.chat_type === 'ai_friend' || item.type === 'ai_friend')
})

// 获取当前AI好友类型
const currentAIFriendType = computed(() => {
  const aiFriendChat = chatList.value.find(item => item.chat_type === 'ai_friend' || item.type === 'ai_friend')
  return aiFriendChat?.friend_type || null
})

// 获取AI好友类型名称
const getAIFriendTypeName = (type) => {
  const typeObj = aiFriendTypes.find(t => t.value === type)
  return typeObj ? typeObj.name : ''
}

// 处理AI好友点击
const handleAIFriendClick = async () => {
  try {
    // 先检查是否已有AI好友
    const aiFriendData = await aiFriend.get()
    if (aiFriendData.code === 200 && aiFriendData.data) {
      // 已有AI好友，直接打开聊天
      const aiFriendChat = chatList.value.find(item => item.chat_type === 'ai_friend' || item.type === 'ai_friend')
      if (aiFriendChat) {
        await selectChat(aiFriendChat)
      } else {
        // 如果聊天列表中还没有，创建一个临时聊天项
        const chatItem = {
          room: aiFriendData.data.room,
          name: `AI好友（${aiFriendData.data.friend_type_name}）`,
          chat_type: 'ai_friend',
          type: 'ai_friend',
          friend_type: aiFriendData.data.friend_type,
          user_id: 0,
          updated_at: aiFriendData.data.updated_at
        }
        await selectChat(chatItem)
      }
    } else {
      // 没有AI好友，显示类型选择对话框
      showAIFriendTypeModal.value = true
    }
  } catch (e) {
    console.error('获取AI好友失败:', e)
    // 如果获取失败，也显示类型选择对话框
    showAIFriendTypeModal.value = true
  }
}

// 确认AI好友类型
const confirmAIFriendType = async () => {
  try {
    const data = await aiFriend.createOrUpdate(selectedAIFriendType.value)
    if (data.code === 200) {
      showAIFriendTypeModal.value = false
      showToast('AI好友创建成功', 'success')
      // 刷新聊天列表（会包含新创建的AI好友）
      await loadChatList()
      // 等待列表更新后，打开AI好友聊天
      await nextTick()
      const aiFriendChat = chatList.value.find(item => item.chat_type === 'ai_friend' || item.type === 'ai_friend')
      if (aiFriendChat) {
        await selectChat(aiFriendChat)
      }
    } else {
      showToast('创建AI好友失败', 'error')
    }
  } catch (e) {
    console.error('创建AI好友失败:', e)
    showToast('创建AI好友失败', 'error')
  }
}

const filteredChatList = computed(() => {
  if (!searchKeyword.value.trim()) {
    return chatList.value
  }
  
  const keyword = searchKeyword.value.trim().toLowerCase()
  
  return chatList.value.filter(item => {
    // 获取用户名（后端返回的是 receiver_username）
    const username = item.receiver_username || item.username || ''
    
    // 获取邮箱
    const email = item.email || ''
    
    // 获取原始昵称（后端返回的 nickname 字段，如果没有则使用 name）
    // 注意：如果设置了备注，item.name 是备注，所以需要单独获取昵称
    const nickname = item.nickname || (item.remark ? null : item.name) || ''
    
    // 获取显示名称（优先备注，然后是昵称，最后是用户名）
    const displayName = item.remark || item.name || username || ''
    
    // 检查备注、昵称、用户名、邮箱是否包含搜索关键词
    const matchRemark = item.remark && item.remark.toLowerCase().includes(keyword)
    const matchNickname = nickname && nickname.toLowerCase().includes(keyword)
    const matchUsername = username && username.toLowerCase().includes(keyword)
    const matchEmail = email && email.toLowerCase().includes(keyword)
    const matchDisplayName = displayName.toLowerCase().includes(keyword)
    
    return matchRemark || matchNickname || matchUsername || matchEmail || matchDisplayName
  })
})

// 分离置顶和未置顶的聊天，并分别按时间排序
const filteredPinnedChatList = computed(() => {
  const pinned = filteredChatList.value.filter(item => item.is_pinned === 1 || item.is_pinned === true)
  // 按时间降序排序（最新的在前）
  return pinned.sort((a, b) => {
    const timeA = a.updated_at ? new Date(a.updated_at).getTime() : 0
    const timeB = b.updated_at ? new Date(b.updated_at).getTime() : 0
    return timeB - timeA
  })
})

const filteredUnpinnedChatList = computed(() => {
  const unpinned = filteredChatList.value.filter(item => !item.is_pinned || item.is_pinned === 0 || item.is_pinned === false)
  // 按时间降序排序（最新的在前）
  return unpinned.sort((a, b) => {
    const timeA = a.updated_at ? new Date(a.updated_at).getTime() : 0
    const timeB = b.updated_at ? new Date(b.updated_at).getTime() : 0
    return timeB - timeA
  })
})

// 过滤收藏列表：根据分类筛选，并按时间降序排列（最新的在前）
const filteredFavorites = computed(() => {
  let filtered = []
  if (favoriteCategory.value === 'all') {
    filtered = favoritesList.value
  } else {
    filtered = favoritesList.value.filter(item => item.type === favoriteCategory.value)
  }
  
  // 按创建时间降序排序（最新的在前）
  return filtered.sort((a, b) => {
    const timeA = a.created_at ? new Date(a.created_at).getTime() : 0
    const timeB = b.created_at ? new Date(b.created_at).getTime() : 0
    return timeB - timeA
  })
})

// 过滤好友列表：根据搜索关键词匹配备注、昵称或用户名
const filteredFriendList = computed(() => {
  if (!searchKeyword.value.trim()) {
    return friendList.value
  }
  
  const keyword = searchKeyword.value.trim().toLowerCase()
  
  // 过滤每个分组中的好友
  return friendList.value.map(group => {
    const filteredFriends = group.friend.filter(friend => {
      // 获取备注、昵称、用户名、邮箱
      const remark = friend.remark || ''
      const nickname = friend.name || ''
      const username = friend.username || ''
      const email = friend.email || ''
      
      // 获取显示名称（优先备注，然后是昵称，最后是用户名）
      const displayName = remark || nickname || username || ''
      
      // 检查备注、昵称、用户名、邮箱是否包含搜索关键词
      const matchRemark = remark && remark.toLowerCase().includes(keyword)
      const matchNickname = nickname && nickname.toLowerCase().includes(keyword)
      const matchUsername = username && username.toLowerCase().includes(keyword)
      const matchEmail = email && email.toLowerCase().includes(keyword)
      const matchDisplayName = displayName.toLowerCase().includes(keyword)
      
      return matchRemark || matchNickname || matchUsername || matchEmail || matchDisplayName
    })
    
    // 只返回有匹配好友的分组
    if (filteredFriends.length > 0) {
      return {
        ...group,
        friend: filteredFriends
      }
    }
    return null
  }).filter(group => group !== null) // 过滤掉空分组
})

const filteredReceivedFriendRequests = computed(() => {
  if (!searchKeyword.value.trim()) {
    return receivedFriendRequests.value
  }
  const keyword = searchKeyword.value.trim().toLowerCase()
  return receivedFriendRequests.value.filter(request => {
    const user = request.sender || {}
    return [user.name, user.username, user.email]
      .filter(Boolean)
      .some(field => field.toLowerCase().includes(keyword))
  })
})

const filteredSentFriendRequests = computed(() => {
  if (!searchKeyword.value.trim()) {
    return sentFriendRequests.value
  }
  const keyword = searchKeyword.value.trim().toLowerCase()
  return sentFriendRequests.value.filter(request => {
    const user = request.receiver || {}
    return [user.name, user.username, user.email]
      .filter(Boolean)
      .some(field => field.toLowerCase().includes(keyword))
  })
})

// 计算所有分组中的好友总数
const totalFriendCount = computed(() => {
  return filteredFriendList.value.reduce((total, group) => {
    return total + (group.friend?.length || 0)
  }, 0)
})

// 通讯录选项卡下的群聊列表（从group.getList()获取，已过滤已解散的群聊）
const groupChatListForContact = ref([])

// 从聊天列表中筛选出群聊（用于其他用途，不包括已解散的群聊）
const groupChatList = computed(() => {
  return chatList.value.filter(item => {
    const chatType = item.chat_type || (item.group_id ? 'group' : 'private')
    return chatType === 'group'
  })
})

// 过滤群聊列表（支持搜索）- 使用通讯录专用的群聊列表
const filteredGroupChatList = computed(() => {
  if (!searchKeyword.value.trim()) {
    return groupChatListForContact.value
  }
  
  const keyword = searchKeyword.value.trim().toLowerCase()
  
  return groupChatListForContact.value.filter(groupChat => {
    const name = groupChat.name || ''
    const remark = groupChat.remark || ''
    
    return name.toLowerCase().includes(keyword) || remark.toLowerCase().includes(keyword)
  })
})

// 判断是否是系统通知（包括系统通知和撤回消息）
const isSystemMessage = (msg) => {
  return msg.type === 'system' || msg.media_type === 'system' || msg.is_recalled === 1
}

// 判断当前群聊是否已解散
const isGroupDisbanded = computed(() => {
  if (currentChatInfo.value?.type !== 'group') return false
  return groupInfo.value?.is_disbanded === 1
})

// 格式化聊天预览，用红色字体显示@标记
const formatChatPreview = (item) => {
  if (!item.lastMessage) {
    return '暂无消息'
  }
  
  let text = item.lastMessage
  
  // 转义HTML，防止XSS攻击
  const escapeHtml = (str) => {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }
  
  // 如果是转发消息，直接返回（后端已经处理好了）
  if (item.media_type === 'forward_multiple') {
    return escapeHtml(text)
  }
  
  // 尝试解析JSON格式的系统通知
  try {
    const contentData = JSON.parse(text)
    if (contentData.type === 'join_by_search' && contentData.user_id) {
      // 处理通过搜索加入群聊的系统通知
      if (contentData.user_id === props.user.id) {
        // 如果加入者是自己，显示"你通过搜索加入了群聊"
        text = '你通过搜索加入了群聊'
      } else {
        // 获取加入者的显示名称（对于当前用户）
        let joinerDisplayName = '用户'
        // 如果是群聊，尝试从群成员列表中查找
        if (item.group_id && groupMembers.value.length > 0) {
          const joinerMember = groupMembers.value.find(m => m.user_id === contentData.user_id)
          if (joinerMember) {
            joinerDisplayName = getMemberDisplayName(joinerMember)
          } else {
            // 如果找不到群成员信息，尝试从好友列表中查找备注
            const friend = allContacts.value.find(c => c.user_id === contentData.user_id)
            if (friend) {
              joinerDisplayName = friend.remark || friend.displayName || friend.name || friend.username || '用户'
            }
          }
        } else {
          // 如果不是群聊或群成员列表未加载，尝试从好友列表中查找
          const friend = allContacts.value.find(c => c.user_id === contentData.user_id)
          if (friend) {
            joinerDisplayName = friend.remark || friend.displayName || friend.name || friend.username || '用户'
          }
        }
        text = `${joinerDisplayName}通过搜索加入了群聊`
      }
    } else if (contentData.type === 'invite' && contentData.creator_id && contentData.invited_member_ids) {
      // 处理创建群聊时邀请加入的系统通知
      let creatorDisplayName = '用户'
      if (contentData.creator_id === props.user.id) {
        creatorDisplayName = '你'
      } else {
        if (item.group_id && groupMembers.value.length > 0) {
          const member = groupMembers.value.find(m => m.user_id === contentData.creator_id)
          if (member) {
            creatorDisplayName = getMemberDisplayName(member)
          } else {
            const friend = allContacts.value.find(c => c.user_id === contentData.creator_id)
            if (friend) {
              creatorDisplayName = friend.remark || friend.displayName || friend.name || friend.username || '用户'
            }
          }
        } else {
          const friend = allContacts.value.find(c => c.user_id === contentData.creator_id)
          if (friend) {
            creatorDisplayName = friend.remark || friend.displayName || friend.name || friend.username || '用户'
          }
        }
      }
      text = `${creatorDisplayName}邀请${contentData.invited_member_ids.length}人加入群聊`
    } else if (contentData.type === 'invite_member' && contentData.inviter_id && contentData.invited_user_id) {
      // 处理添加群成员的系统通知
      let inviterDisplayName = '用户'
      if (contentData.inviter_id === props.user.id) {
        inviterDisplayName = '你'
      } else {
        if (item.group_id && groupMembers.value.length > 0) {
          const member = groupMembers.value.find(m => m.user_id === contentData.inviter_id)
          if (member) {
            inviterDisplayName = getMemberDisplayName(member)
          }
        }
      }
      let invitedDisplayName = '用户'
      if (contentData.invited_user_id === props.user.id) {
        invitedDisplayName = '你'
      } else {
        if (item.group_id && groupMembers.value.length > 0) {
          const member = groupMembers.value.find(m => m.user_id === contentData.invited_user_id)
          if (member) {
            invitedDisplayName = getMemberDisplayName(member)
          }
        }
      }
      text = `${inviterDisplayName}邀请了${invitedDisplayName}进入群聊`
    } else if (contentData.type === 'leave_group' && contentData.user_id) {
      // 处理退出群聊的系统通知
      if (contentData.user_id === props.user.id) {
        text = '你退出了群聊'
      } else {
        let leaverDisplayName = '用户'
        const friend = allContacts.value.find(c => c.user_id === contentData.user_id)
        if (friend) {
          leaverDisplayName = friend.remark || friend.displayName || friend.name || friend.username || '用户'
        }
        text = `${leaverDisplayName}退出了群聊`
      }
    } else if (contentData.type === 'transfer_ownership' && contentData.old_creator_id && contentData.new_creator_id) {
      // 处理转让群主的系统通知
      if (contentData.new_creator_id === props.user.id) {
        text = '你已成为新的群主'
      } else {
        let newCreatorDisplayName = '用户'
        if (item.group_id && groupMembers.value.length > 0) {
          const member = groupMembers.value.find(m => m.user_id === contentData.new_creator_id)
          if (member) {
            newCreatorDisplayName = getMemberDisplayName(member)
          }
        }
        text = `${newCreatorDisplayName}已成为新的群主`
      }
    } else if (contentData.type === 'add_admin' && contentData.operator_id && contentData.admin_user_id) {
      // 处理添加管理员的系统通知
      if (contentData.admin_user_id === props.user.id) {
        text = '已将你添加为群管理员'
      } else {
        let adminDisplayName = '用户'
        if (item.group_id && groupMembers.value.length > 0) {
          const member = groupMembers.value.find(m => m.user_id === contentData.admin_user_id)
          if (member) {
            adminDisplayName = getMemberDisplayName(member)
          }
        }
        text = `已将${adminDisplayName}添加为群管理员`
      }
    } else if (contentData.type === 'remove_admin' && contentData.operator_id && contentData.admin_user_id) {
      // 处理移除管理员的系统通知
      if (contentData.admin_user_id === props.user.id) {
        text = '已将你从群管理员中移除'
      } else {
        let adminDisplayName = '用户'
        if (item.group_id && groupMembers.value.length > 0) {
          const member = groupMembers.value.find(m => m.user_id === contentData.admin_user_id)
          if (member) {
            adminDisplayName = getMemberDisplayName(member)
          }
        }
        text = `已将${adminDisplayName}从群管理员中移除`
      }
    } else if (contentData.type === 'remove_member' && contentData.operator_id && contentData.removed_user_id) {
      // 处理移除成员的系统通知
      let operatorDisplayName = '用户'
      if (contentData.operator_id === props.user.id) {
        operatorDisplayName = '你'
      } else {
        if (item.group_id && groupMembers.value.length > 0) {
          const member = groupMembers.value.find(m => m.user_id === contentData.operator_id)
          if (member) {
            operatorDisplayName = getMemberDisplayName(member)
          }
        }
      }
      let removedDisplayName = '用户'
      if (contentData.removed_user_id === props.user.id) {
        removedDisplayName = '你'
      } else {
        const friend = allContacts.value.find(c => c.user_id === contentData.removed_user_id)
        if (friend) {
          removedDisplayName = friend.remark || friend.displayName || friend.name || friend.username || '用户'
        }
      }
      text = `${operatorDisplayName}将${removedDisplayName}移出了群聊`
    } else if (contentData.type === 'disband_group' && contentData.creator_id) {
      // 处理解散群聊的系统通知
      if (contentData.creator_id === props.user.id) {
        text = '你已解散该群聊'
      } else {
        let creatorDisplayName = '用户'
        const friend = allContacts.value.find(c => c.user_id === contentData.creator_id)
        if (friend) {
          creatorDisplayName = friend.remark || friend.displayName || friend.name || friend.username || '用户'
        }
        text = `${creatorDisplayName}已解散该群聊`
      }
    } else if (contentData.type === 'ai_friend_created' && contentData.message) {
      // 处理AI好友创建成功的系统通知
      text = contentData.message
    } else if (contentData.type === 'ai_friend_type_changed' && contentData.friend_type_name) {
      // 处理AI好友类型改变的系统通知
      text = `AI好友类型已切换为${contentData.friend_type_name}`
    } else if (contentData.type === 'ai_friend_context_cleared') {
      // 处理AI好友上下文清空的系统通知
      text = 'AI好友上下文已清空'
    }
  } catch (e) {
    // 如果不是JSON格式，使用原始内容
  }
  
  // 如果消息中包含@标记且未读，用红色字体显示
  if (item.is_mentioned && !item.mention_read) {
    const mentionTag = item.is_mention_all ? '【@所有人】' : '【有人@我】'
    // 检查消息开头是否已经有@标记
    if (text.startsWith(mentionTag)) {
      // 用红色字体包裹@标记（使用内联样式确保显示）
      const restText = text.substring(mentionTag.length)
      return `<span style="color: #ff0000; font-weight: bold; margin-right: 4px;">${escapeHtml(mentionTag)}</span><span style="color: #666;">${escapeHtml(restText)}</span>`
    } else {
      // 如果没有，添加@标记（这种情况不应该发生，但为了安全起见）
      return `<span style="color: #ff0000; font-weight: bold; margin-right: 4px;">${escapeHtml(mentionTag)}</span><span style="color: #666;">${escapeHtml(text)}</span>`
    }
  }
  
  // 转义HTML，防止XSS攻击
  return escapeHtml(text)
}
// HTML转义函数
const escapeHtml = (str) => {
  if (!str) return ''
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;')
}

// 格式化消息内容，将换行符转换为<br>标签
const formatMessageContent = (content) => {
  if (!content) return ''
  // 调试：如果是群公告消息，记录content
  if (String(content).startsWith('群公告')) {
    console.log('formatMessageContent: 群公告消息content:', JSON.stringify(content))
  }
  // 先转义HTML，防止XSS攻击
  const escaped = escapeHtml(String(content))
  // 将换行符转换为<br>标签
  const result = escaped.replace(/\n/g, '<br>')
  if (String(content).startsWith('群公告')) {
    console.log('formatMessageContent: 转换后结果:', result.substring(0, 100))
  }
  return result
}

// 获取系统通知的显示文本（根据sender_id判断是否是自己发送的）
const getSystemNotificationText = (msg) => {
  if (!msg.content) return ''
  
  // 尝试解析JSON格式的系统通知
  try {
    const contentData = JSON.parse(msg.content)
    if (contentData.type === 'disband_group' && contentData.creator_id) {
      // 处理解散群聊的系统通知
      if (contentData.creator_id === props.user.id) {
        // 如果解散者是自己，显示"你已解散该群聊"
        return '你已解散该群聊'
      } else {
        // 获取解散者的显示名称（对于当前用户）
        let creatorDisplayName = '用户'
        // 尝试从群成员列表中查找
        const member = groupMembers.value.find(m => m.user_id === contentData.creator_id)
        if (member) {
          creatorDisplayName = getMemberDisplayName(member)
        } else {
          // 如果找不到群成员信息，使用系统通知中的信息
          // 尝试从好友列表中查找备注
          const friend = allContacts.value.find(c => c.user_id === contentData.creator_id)
          let friendRemark = null
          if (friend) {
            friendRemark = friend.remark
          }
          // 优先级：群聊昵称 > 好友备注 > 个人昵称 > 用户名
          let groupNickname = contentData.group_nickname
          if (groupNickname && groupNickname === contentData.name) {
            groupNickname = null // 群聊昵称是默认值，忽略它
          }
          creatorDisplayName = groupNickname || friendRemark || contentData.name || contentData.username || '用户'
        }
        return `${creatorDisplayName}已解散该群聊`
      }
    } else if (contentData.type === 'remove_member' && contentData.operator_id && contentData.removed_user_id) {
      // 处理移除成员的系统通知
      // 获取操作者的显示名称（对于当前用户）
      let operatorDisplayName = '用户'
      if (contentData.operator_id === props.user.id) {
        // 如果操作者是自己，显示"你"
        operatorDisplayName = '你'
      } else {
        // 尝试从群成员列表中查找
        const operatorMember = groupMembers.value.find(m => m.user_id === contentData.operator_id)
        if (operatorMember) {
          operatorDisplayName = getMemberDisplayName(operatorMember)
        } else {
          // 如果找不到群成员信息，使用系统通知中的信息
          const friend = allContacts.value.find(c => c.user_id === contentData.operator_id)
          let friendRemark = null
          if (friend) {
            friendRemark = friend.remark
          }
          // 优先级：群聊昵称 > 好友备注 > 个人昵称 > 用户名
          let groupNickname = contentData.operator_group_nickname
          if (groupNickname && groupNickname === contentData.operator_name) {
            groupNickname = null // 群聊昵称是默认值，忽略它
          }
          operatorDisplayName = groupNickname || friendRemark || contentData.operator_name || contentData.operator_username || '用户'
        }
      }
      
      // 获取被移除成员的显示名称（对于当前用户）
      let removedDisplayName = '用户'
      if (contentData.removed_user_id === props.user.id) {
        // 如果被移除的成员是自己，显示"你"
        removedDisplayName = '你'
      } else {
        // 尝试从群成员列表中查找（可能已经被移除了，所以可能找不到）
        const removedMember = groupMembers.value.find(m => m.user_id === contentData.removed_user_id)
        if (removedMember) {
          removedDisplayName = getMemberDisplayName(removedMember)
        } else {
          // 如果找不到群成员信息，使用系统通知中的信息
          const friend = allContacts.value.find(c => c.user_id === contentData.removed_user_id)
          let friendRemark = null
          if (friend) {
            friendRemark = friend.remark
          }
          // 优先级：群聊昵称 > 好友备注 > 个人昵称 > 用户名
          let groupNickname = contentData.removed_group_nickname
          if (groupNickname && groupNickname === contentData.removed_name) {
            groupNickname = null // 群聊昵称是默认值，忽略它
          }
          removedDisplayName = groupNickname || friendRemark || contentData.removed_name || contentData.removed_username || '用户'
        }
      }
      
      return `${operatorDisplayName}将${removedDisplayName}移出了群聊`
    } else if (contentData.type === 'recall_member_message' && contentData.operator_id) {
      // 处理撤回成员消息的系统通知
      // 获取操作者的显示名称（对于当前用户）
      let operatorDisplayName = '用户'
      if (contentData.operator_id === props.user.id) {
        // 如果操作者是自己，显示"你"
        operatorDisplayName = '你'
      } else {
        // 尝试从群成员列表中查找
        const operatorMember = groupMembers.value.find(m => m.user_id === contentData.operator_id)
        if (operatorMember) {
          operatorDisplayName = getMemberDisplayName(operatorMember)
        } else {
          // 如果找不到群成员信息，使用系统通知中的信息
          const friend = allContacts.value.find(c => c.user_id === contentData.operator_id)
          let friendRemark = null
          if (friend) {
            friendRemark = friend.remark
          }
          // 优先级：群聊昵称 > 好友备注 > 个人昵称 > 用户名
          let groupNickname = contentData.operator_group_nickname
          if (groupNickname && groupNickname === contentData.operator_name) {
            groupNickname = null // 群聊昵称是默认值，忽略它
          }
          operatorDisplayName = groupNickname || friendRemark || contentData.operator_name || contentData.operator_username || '用户'
        }
      }
      
      return `${operatorDisplayName}撤回了一条成员消息`
    } else if (contentData.type === 'ai_friend_type_changed' && contentData.friend_type_name) {
      // 处理AI好友人格切换的系统通知
      return `已将AI好友切换为${contentData.friend_type_name}`
    } else if (contentData.type === 'ai_friend_context_cleared') {
      // 处理AI好友清空上下文的系统通知
      return '已清空AI好友的上下文'
    }
  } catch (e) {
    // 如果不是JSON格式，继续处理其他类型
  }
  
  // 判断是否包含"修改了群聊名称为"
  if (msg.content.includes('修改了群聊名称为')) {
    const isOwnMessage = msg.sender_id === props.user.id
    if (isOwnMessage) {
      // 提取新群聊名称
      const match = msg.content.match(/修改了群聊名称为\s*(.+)/)
      if (match && match[1]) {
        return `你修改了群聊名称为${match[1]}`
      }
    } else {
      // 获取发送者显示名称
      let senderName = '用户'
      if (currentChatInfo.value?.type === 'group') {
        // 群聊：优先使用群聊昵称，然后是备注，然后是个人昵称，最后是用户名
        const member = groupMembers.value.find(m => m.user_id === msg.sender_id)
        if (member) {
          senderName = getMemberDisplayName(member)
        } else {
          // 如果找不到群成员信息，尝试从消息中获取
          senderName = msg.nickname || msg.name || '用户'
        }
      } else {
        // 私聊：优先使用备注，其次是昵称，最后是用户名
        senderName = currentChatInfo.value?.name || '用户'
      }
      // 提取新群聊名称
      const match = msg.content.match(/修改了群聊名称为\s*(.+)/)
      if (match && match[1]) {
        return `${senderName}修改了群聊名称为${match[1]}`
      }
    }
  }
  
  // 检查是否是"开启了朋友验证"的系统通知
  if (msg.content && msg.content.includes('开启了朋友验证') && msg.content.includes('发送朋友验证')) {
    // 提取接收者信息
    // 如果系统通知的sender_id是当前用户，接收者是对方（currentChatInfo.value?.user_id）
    // 如果系统通知的sender_id不是当前用户，接收者是当前用户自己（因为系统通知是告诉当前用户，对方开启了朋友验证）
    let receiverId = null
    let receiverName = '用户'
    let receiverUsername = ''
    let receiverEmail = ''
    let receiverAvatar = ''
    
    if (msg.sender_id === props.user.id) {
      // 系统通知的sender_id是当前用户，接收者是对方
      receiverId = currentChatInfo.value?.user_id
      receiverName = currentChatInfo.value?.name || '用户'
      receiverUsername = currentChatInfo.value?.username || ''
      receiverEmail = currentChatInfo.value?.email || ''
      receiverAvatar = currentChatInfo.value?.avatar || ''
    } else {
      // 系统通知的sender_id不是当前用户，说明这个系统通知是告诉当前用户，对方开启了朋友验证
      // 系统通知内容格式："nickname1 开启了朋友验证，你还不是他（她）朋友..."
      // 这里的nickname1是对方（开启了朋友验证的人），也就是接收者
      // 从系统通知内容中提取接收者名称（第一个词）
      const match = msg.content.match(/^(.+?)\s+开启了朋友验证/)
      if (match && match[1]) {
        receiverName = match[1]
      }
      // 从聊天列表中查找对应的用户信息（对方）
      const chatItem = chatList.value.find(c => c.room === msg.room)
      if (chatItem && chatItem.user_id) {
        receiverId = chatItem.user_id
        receiverName = chatItem.remark || chatItem.name || chatItem.username || receiverName
        receiverUsername = chatItem.username || ''
        receiverAvatar = chatItem.avatar || ''
      } else if (currentChatInfo.value?.user_id) {
        // 如果找不到，使用当前聊天信息的user_id（对方）
        receiverId = currentChatInfo.value.user_id
        receiverName = currentChatInfo.value.name || receiverName
        receiverUsername = currentChatInfo.value.username || ''
        receiverAvatar = currentChatInfo.value.avatar || ''
      } else {
        // 如果还是找不到，尝试从系统通知的receiver_id获取（但这种情况应该不会发生）
        // 实际上，对于"开启了朋友验证"的系统通知，receiver_id应该是sender_id（转发者自己）
        // 所以这里我们需要从系统通知内容中提取接收者信息
        // 但是，如果没有chatItem和currentChatInfo，我们无法获取准确的receiverId
        // 所以这里暂时不设置receiverId，让按钮不显示
        console.warn('无法找到接收者信息，系统通知可能无法显示"发送朋友验证"按钮')
      }
    }
    
    // 即使没有receiverId，也要显示系统通知内容（只是没有按钮）
    const escapedContent = escapeHtml(msg.content)
    if (receiverId) {
      // 只匹配文本末尾的"发送朋友验证"（最后6个字）
      // 使用正则表达式匹配末尾的"发送朋友验证"
      const buttonHtml = `<button class="send-verification-btn" data-receiver-id="${receiverId}" data-receiver-name="${escapeHtml(receiverName)}" data-receiver-username="${escapeHtml(receiverUsername)}" data-receiver-email="${escapeHtml(receiverEmail)}" data-receiver-avatar="${escapeHtml(receiverAvatar)}">发送朋友验证</button>`
      // 只替换末尾的"发送朋友验证"
      return escapedContent.replace(/发送朋友验证$/, buttonHtml)
    } else {
      // 如果没有receiverId，直接返回转义后的内容（不显示按钮）
      return escapedContent
    }
  }
  
  // 其他系统通知直接返回原内容
  return escapeHtml(msg.content)
}

// 过滤已删除的消息
const filteredMessages = computed(() => {
  // 过滤已删除的消息、系统通知和撤回消息（这些都不显示在聊天记录中）
  return messages.value.filter(msg => {
    // 系统通知和撤回消息不显示在聊天记录中
    if (isSystemMessage(msg)) return false
    return !deletedMessageIds.value.has(msg.id)
  })
})

// 显示的消息（包括系统通知和撤回消息，但不包括已删除的消息）
const displayMessages = computed(() => {
  const filtered = messages.value.filter(msg => {
    // 系统通知和撤回消息显示在聊天区
    if (isSystemMessage(msg)) {
      // 调试：检查系统通知是否包含不应该有的字段
      if (msg.avatar || msg.nickname) {
        console.warn('⚠️ 系统通知包含不应该有的字段:', {
          id: msg.id,
          type: msg.type,
          media_type: msg.media_type,
          avatar: msg.avatar,
          nickname: msg.nickname,
          content: msg.content,
          fullObject: JSON.parse(JSON.stringify(msg))
        })
      }
      // 调试：检查"开启了朋友验证"的系统通知
      if (msg.content && msg.content.includes('开启了朋友验证')) {
        console.log('✅ displayMessages中包含"开启了朋友验证"的系统通知:', {
          id: msg.id,
          type: msg.type,
          media_type: msg.media_type,
          content: msg.content,
          room: msg.room,
          currentRoom: currentRoom.value,
          sender_id: msg.sender_id,
          receiver_id: msg.receiver_id
        })
      }
      return true
    }
    return !deletedMessageIds.value.has(msg.id)
  })
  console.log('displayMessages计算属性 - 总消息数:', messages.value.length, '过滤后:', filtered.length, '系统通知数:', filtered.filter(msg => isSystemMessage(msg)).length)
  return filtered
})

onUnmounted(() => {
  if (ws.value) {
    ws.value.close()
  }
  // 清理倒计时定时器
  if (usernameCountdownTimer) {
    clearInterval(usernameCountdownTimer)
    usernameCountdownTimer = null
  }
  // 清理好友申请轮询定时器
  if (friendRequestPollingTimer) {
    clearInterval(friendRequestPollingTimer)
    friendRequestPollingTimer = null
  }
  // 清理聊天列表轮询定时器
  if (chatListPollingTimer) {
    clearInterval(chatListPollingTimer)
    chatListPollingTimer = null
  }
  // 清理日期选择器的事件监听
  if (handleClickOutsideDatePicker) {
    document.removeEventListener('click', handleClickOutsideDatePicker)
  }
  // 清理编辑区域点击外部关闭的事件监听
  document.removeEventListener('click', handleClickOutsideEdit)
  // 清理全局事件监听器
  if (window._chatRoomCleanup) {
    window._chatRoomCleanup()
    delete window._chatRoomCleanup
  }
})

const loadChatList = async () => {
  try {
    const token = localStorage.getItem('token')
    if (!token) {
      console.warn('没有token，跳过加载聊天列表')
      return
    }
    
    const data = await messagesApi.getList()
    if (data.code === 200) {
      let list = data.data || []
      
      // 按最新消息时间排序（updated_at字段，降序）
      list.sort((a, b) => {
        const timeA = a.updated_at ? new Date(a.updated_at).getTime() : 0
        const timeB = b.updated_at ? new Date(b.updated_at).getTime() : 0
        return timeB - timeA // 降序，最新的在前
      })
      
      // 去重：根据 room 字段去重，保留最新的记录（由于已排序，第一个就是最新的）
      const roomMap = new Map()
      for (const item of list) {
        if (item.room && !roomMap.has(item.room)) {
          roomMap.set(item.room, item)
        }
      }
      list = Array.from(roomMap.values())
      
      chatList.value = list
      
      // 如果当前有打开的聊天，更新聊天框顶部的名称，并清除未读计数
      if (currentRoom.value && currentChatInfo.value) {
        const updatedChat = chatList.value.find(item => item.room === currentRoom.value)
        if (updatedChat) {
          // 如果当前打开的聊天有未读数，清除它（因为用户正在查看该聊天）
          if (updatedChat.unreadCount > 0) {
            updatedChat.unreadCount = 0
          }
          
          const chatType = updatedChat.chat_type || (updatedChat.group_id ? 'group' : 'private')
          const displayName = chatType === 'group'
            ? (updatedChat.remark || updatedChat.name || '群聊')
            : (updatedChat.remark || updatedChat.name || updatedChat.username || '聊天')
          currentChatInfo.value = {
            ...currentChatInfo.value,
            name: displayName,
            remark: updatedChat.remark
          }
        }
      }
    } else if (data.code === 4000) {
      // Token错误，清除并提示重新登录
      console.error('Token验证失败，清除token')
      clearToken()
      emits('logout')
    }
  } catch (e) {
    console.error('加载聊天列表失败:', e)
  }
}

const loadFriendList = async () => {
  try {
    const token = localStorage.getItem('token')
    if (!token) {
      console.warn('没有token，跳过加载好友列表')
      return
    }
    
    const data = await friend.getList()
    if (data.code === 200) {
      friendList.value = data.data || []
      // 更新所有联系人列表（用于发起群聊）
      updateAllContacts()
    } else if (data.code === 4000) {
      // Token错误，清除并提示重新登录
      console.error('Token验证失败，清除token')
      clearToken()
      emits('logout')
    }
  } catch (e) {
    console.error('加载好友列表失败:', e)
  }
}

// 加载好友推荐
const loadFriendRecommendations = async () => {
  try {
    const token = localStorage.getItem('token')
    if (!token) {
      return
    }
    
    const data = await friend.getRecommendations()
    if (data.code === 200) {
      friendRecommendations.value = data.data || []
    }
  } catch (e) {
    console.error('加载好友推荐失败:', e)
  }
}

// 加载通讯录选项卡下的群聊列表（使用group.getList()，已过滤已解散的群聊）
// 后端已优化，一次性返回所有群聊的备注，无需单独请求
const loadGroupChatListForContact = async () => {
  try {
    const token = localStorage.getItem('token')
    if (!token) {
      console.warn('没有token，跳过加载群聊列表')
      return
    }
    
    const data = await group.getList()
    if (data.code === 200) {
      // 后端已返回备注信息，直接使用
      const groupList = data.data || []
      groupChatListForContact.value = groupList
    } else if (data.code === 4000) {
      // Token错误，清除并提示重新登录
      console.error('Token验证失败，清除token')
      clearToken()
      emits('logout')
    }
  } catch (e) {
    console.error('加载群聊列表失败:', e)
  }
}

// 更新所有联系人列表（用于发起群聊）
const updateAllContacts = () => {
  const contacts = []
  
  if (!friendList.value || !Array.isArray(friendList.value)) {
    allContacts.value = []
    filterCreateGroupContacts()
    return
  }
  
  // 遍历所有分组，确保包含所有好友
  friendList.value.forEach(group => {
    // 确保分组存在且有friend字段
    if (group && group.friend && Array.isArray(group.friend)) {
      group.friend.forEach(friend => {
        // 确保好友存在且有user_id
        if (friend && friend.user_id) {
          // 检查是否已经添加过（避免重复）
          const alreadyAdded = contacts.some(c => c.user_id === friend.user_id)
          if (!alreadyAdded) {
            const displayName = friend.remark || friend.name || friend.username || '用户'
            contacts.push({
              user_id: friend.user_id,
              username: friend.username || '',
              name: friend.name || '',
              avatar: friend.avatar || '',
              remark: friend.remark || '',
              displayName: displayName
            })
          }
        }
      })
    }
  })
  // 排序：ABC等字母从小到大，数字等放在最后
  contacts.sort((a, b) => {
    const nameA = a.displayName.charAt(0).toUpperCase()
    const nameB = b.displayName.charAt(0).toUpperCase()
    const isLetterA = /[A-Z]/.test(nameA)
    const isLetterB = /[A-Z]/.test(nameB)
    const isDigitA = /[0-9]/.test(nameA)
    const isDigitB = /[0-9]/.test(nameB)
    
    // 字母优先
    if (isLetterA && !isLetterB && !isDigitB) return -1
    if (!isLetterA && !isDigitA && isLetterB) return 1
    
    // 数字放在最后
    if (isDigitA && !isDigitB) return 1
    if (!isDigitA && isDigitB) return -1
    
    // 同类型比较
    if (isLetterA && isLetterB) {
      return nameA.localeCompare(nameB)
    }
    if (isDigitA && isDigitB) {
      return nameA.localeCompare(nameB)
    }
    
    // 其他字符放在最后
    return nameA.localeCompare(nameB)
  })
  allContacts.value = contacts
  filterCreateGroupContacts()
}

// 过滤发起群聊的联系人
const filterCreateGroupContacts = () => {
  const keyword = createGroupSearchKeyword.value.trim().toLowerCase()
  if (!keyword) {
    filteredCreateGroupContacts.value = allContacts.value
    return
  }
  filteredCreateGroupContacts.value = allContacts.value.filter(contact => {
    const displayName = contact.displayName || ''
    const username = contact.username || ''
    const name = contact.name || ''
    const remark = contact.remark || ''
    return displayName.toLowerCase().includes(keyword) ||
           username.toLowerCase().includes(keyword) ||
           name.toLowerCase().includes(keyword) ||
           remark.toLowerCase().includes(keyword)
  })
}

// 切换联系人选择
const toggleContactSelection = (userId) => {
  if (selectedContacts.value.has(userId)) {
    selectedContacts.value.delete(userId)
  } else {
    selectedContacts.value.add(userId)
  }
}

// 打开发起群聊弹窗
const openCreateGroupModal = async () => {
  // 强制重新加载好友列表，确保数据是最新的
  await loadFriendList()
  
  showCreateGroupModal.value = true
  createGroupSearchKeyword.value = ''
  createGroupName.value = ''
  createGroupAvatar.value = ''
  selectedContacts.value.clear()
  // 确保在好友列表加载完成后再更新联系人列表
  await nextTick()
  updateAllContacts()
}

// 关闭发起群聊弹窗
const closeCreateGroupModal = () => {
  showCreateGroupModal.value = false
  createGroupSearchKeyword.value = ''
  createGroupName.value = ''
  createGroupAvatar.value = ''
  selectedContacts.value.clear()
  groupAvatarFile.value = null
}

// 选择群头像
const selectGroupAvatar = () => {
  groupAvatarInput.value?.click()
}

// 处理群头像选择
const handleGroupAvatarSelect = async (event) => {
  const file = event.target.files[0]
  if (!file) return
  
  // 验证文件类型
  if (!file.type.startsWith('image/')) {
    showToast('请选择图片文件', 'error')
    if (groupAvatarInput.value) {
      groupAvatarInput.value.value = ''
    }
    return
  }
  
  // 验证文件大小（限制为5MB）
  if (file.size > 5 * 1024 * 1024) {
    showToast('图片大小不能超过5MB', 'error')
    if (groupAvatarInput.value) {
      groupAvatarInput.value.value = ''
    }
    return
  }
  
  // 读取文件并显示裁剪对话框
  const reader = new FileReader()
  reader.onload = (e) => {
    groupAvatarCropperSrc.value = e.target.result
    showGroupAvatarCropper.value = true
  }
  reader.readAsDataURL(file)
}

// 群头像裁剪确认
const handleGroupAvatarCropConfirm = async (croppedFile) => {
  showGroupAvatarCropper.value = false
  groupAvatarCropperSrc.value = ''
  
  // 创建预览URL
  const previewUrl = URL.createObjectURL(croppedFile)
  createGroupAvatar.value = previewUrl
  groupAvatarFile.value = croppedFile
  
  // 清空文件输入
  if (groupAvatarInput.value) {
    groupAvatarInput.value.value = ''
  }
}

// 群头像裁剪取消
const handleGroupAvatarCropCancel = () => {
  showGroupAvatarCropper.value = false
  groupAvatarCropperSrc.value = ''
  // 清空文件输入
  if (groupAvatarInput.value) {
    groupAvatarInput.value.value = ''
  }
}

// 创建群聊
const createGroup = async () => {
  if (selectedContacts.value.size === 0) {
    showToast('请至少选择一个联系人', 'error')
    return
  }
  
  // 如果只选择了1个人，则打开和那个人的私聊
  if (selectedContacts.value.size === 1) {
    const userId = Array.from(selectedContacts.value)[0]
    const contact = allContacts.value.find(c => c.user_id === userId)
    if (contact) {
      // 先刷新聊天列表，确保数据是最新的
      await loadChatList()
      
      // 从聊天列表中查找对应的好友
      const friendItem = chatList.value.find(item => item.user_id === userId && (item.chat_type === 'private' || (!item.chat_type && !item.group_id)))
      if (friendItem) {
        // 关闭弹窗
        closeCreateGroupModal()
        // 打开私聊
        await selectChat(friendItem)
        return
      } else {
        // 如果聊天列表中没有，尝试从好友列表中查找
        const friend = friendList.value.flatMap(group => group.friend || []).find(f => f.user_id === userId)
        if (friend && friend.room) {
          // 关闭弹窗
          closeCreateGroupModal()
          // 打开私聊
          await selectFriend(friend)
          return
        } else {
          showToast('未找到该联系人，请先添加为好友', 'error')
          return
        }
      }
    } else {
      showToast('未找到该联系人', 'error')
      return
    }
  }
  
  // 至少选择2个好友才能创建群聊
  creatingGroup.value = true
  
  try {
    // 准备成员列表
    const memberIds = Array.from(selectedContacts.value).map(userId => {
      const contact = allContacts.value.find(c => c.user_id === userId)
      return {
        id: userId,
        name: contact?.name || contact?.username || '用户',
        avatar: contact?.avatar || ''
      }
    })
    
    // 准备FormData
    const formData = new FormData()
    // 如果名称为空，发送空字符串，后端会设置为NULL，这样每个用户看到的名称会根据自己对成员的备注不同而不同
    formData.append('name', createGroupName.value.trim() || '')
    formData.append('members', JSON.stringify(memberIds))
    if (groupAvatarFile.value) {
      formData.append('avatar', groupAvatarFile.value)
    }
    
    // 调用创建群聊API
    const token = localStorage.getItem('token') || ''
    await initApiUrl()
    const url = `${getApiBaseUrl()}/api/chat/v1/group/create`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': token
      },
      body: formData
    })
    
    const data = await response.json()
    
    if (data.code === 200 && data.data) {
      showToast('群聊创建成功', 'success')
      closeCreateGroupModal()
      
      // 刷新聊天列表
      await loadChatList()
      // 刷新通讯录选项卡下的群聊列表
      await loadGroupChatListForContact()
      
      // 切换到新创建的群聊
      const newGroup = chatList.value.find(item => item.room === data.data.room)
      if (newGroup) {
        await selectChat(newGroup)
      }
    } else {
      showToast('创建群聊失败: ' + (data.message || '未知错误'), 'error')
    }
  } catch (e) {
    console.error('创建群聊失败:', e)
    showToast('创建群聊失败，请重试', 'error')
  } finally {
    creatingGroup.value = false
  }
}

// ========== 群聊信息相关函数 ==========

// 打开群聊信息弹窗（通过group_id）
const openGroupInfoModalById = async (groupId) => {
  if (!groupId) return
  
  showGroupInfoModal.value = true
  groupMemberSearchKeyword.value = ''
  
  try {
    // 加载群聊信息
    const data = await group.getInfo(groupId)
    if (data.code === 200 && data.data) {
      groupInfo.value = data.data
      groupMembers.value = data.data.members || []
      // 加载群公告内容
      announcementContent.value = data.data.announcement || ''
      // 调试：打印群成员数据
      console.log('群成员数据:', groupMembers.value.map(m => ({
        user_id: m.user_id,
        group_nickname: m.group_nickname,
        friend_remark: m.friend_remark,
        name: m.name,
        username: m.username
      })))
      
      // 加载管理员列表
      try {
        const adminData = await group.getAdmins(groupId)
        if (adminData.code === 200) {
          groupAdmins.value = adminData.data || []
        }
      } catch (e) {
        console.error('加载管理员列表失败:', e)
        groupAdmins.value = []
      }
      
      filterGroupMembers()
      
      // 加载用户对群聊的备注和群昵称
      groupRemark.value = data.data.user_remark || ''
      myGroupNickname.value = data.data.user_nickname || ''
      
      // 更新已显示的消息中的发送者名称（如果是群聊且当前正在查看该群聊）
      if (currentChatInfo.value?.type === 'group' && currentChatInfo.value?.group_id === groupId) {
        messages.value = messages.value.map(msg => {
          // 系统通知不更新昵称
          if (isSystemMessage(msg)) {
            return msg
          }
          if (msg.sender_id !== props.user.id) {
            const member = groupMembers.value.find(m => m.user_id === msg.sender_id)
            if (member) {
              return {
                ...msg,
                nickname: getMemberDisplayName(member)
              }
            }
          }
          return msg
        })
      }
    } else {
      showToast('加载群聊信息失败', 'error')
    }
  } catch (e) {
    console.error('加载群聊信息失败:', e)
    showToast('加载群聊信息失败，请重试', 'error')
  }
}

// 打开群聊信息弹窗（从当前聊天）
const openGroupInfoModal = async () => {
  if (!currentChatInfo.value || currentChatInfo.value.type !== 'group') return
  
  const groupId = currentChatInfo.value.group_id
  await openGroupInfoModalById(groupId)
}

// 关闭群聊信息弹窗
const closeGroupInfoModal = () => {
  showGroupInfoModal.value = false
  groupMemberSearchKeyword.value = ''
  editingGroupName.value = false
  editingGroupRemark.value = false
  editingGroupNickname.value = false
  // 如果在右侧面板显示，则切换回聊天视图
  if (rightPanelView.value === 'groupInfo') {
    rightPanelView.value = 'chat'
  }
}

// 过滤群成员（支持多字段搜索，并记录匹配字段）
const filterGroupMembers = () => {
  const keyword = groupMemberSearchKeyword.value.trim().toLowerCase()
  let filtered = []
  
  if (!keyword) {
    filtered = groupMembers.value.map(m => ({ ...m, matchField: null }))
  } else {
    filtered = groupMembers.value
      .map(member => {
        // 判断是否设置了群聊昵称
        const hasGroupNickname = member.group_nickname && 
                                 String(member.group_nickname).trim() && 
                                 member.group_nickname !== member.name
        
        // 检查各个字段是否匹配
        const matchGroupNickname = hasGroupNickname && 
                                   String(member.group_nickname).toLowerCase().includes(keyword)
        const matchFriendRemark = member.friend_remark && 
                                  String(member.friend_remark).toLowerCase().includes(keyword)
        const matchName = member.name && 
                         String(member.name).toLowerCase().includes(keyword)
        const matchUsername = member.username && 
                             String(member.username).toLowerCase().includes(keyword)
        
        // 如果任一字段匹配，返回成员信息并记录匹配字段
        if (matchGroupNickname || matchFriendRemark || matchName || matchUsername) {
          let matchField = null
          // 确定匹配的字段（优先级：群聊昵称 > 备注 > 昵称 > 用户名）
          if (matchGroupNickname) {
            matchField = { type: 'group_nickname', value: member.group_nickname }
          } else if (matchFriendRemark) {
            matchField = { type: 'friend_remark', value: member.friend_remark }
          } else if (matchName) {
            matchField = { type: 'name', value: member.name }
          } else if (matchUsername) {
            matchField = { type: 'username', value: member.username }
          }
          
          return { ...member, matchField }
        }
        return null
      })
      .filter(member => member !== null)
  }
  
  // 排序：群主 -> 管理员 -> 普通成员
  filtered.sort((a, b) => {
    const aIsOwner = groupInfo.value && groupInfo.value.creator_id === a.user_id
    const bIsOwner = groupInfo.value && groupInfo.value.creator_id === b.user_id
    const aIsAdmin = isAdmin(a.user_id)
    const bIsAdmin = isAdmin(b.user_id)
    
    // 群主优先级最高
    if (aIsOwner && !bIsOwner) return -1
    if (!aIsOwner && bIsOwner) return 1
    
    // 如果都是群主或都不是群主，比较管理员身份
    if (aIsAdmin && !bIsAdmin) return -1
    if (!aIsAdmin && bIsAdmin) return 1
    
    // 如果身份相同，保持原顺序
    return 0
  })
  
  filteredGroupMembers.value = filtered
}

// 判断是否是管理员
const isAdmin = (userId) => {
  return groupAdmins.value.some(admin => admin.user_id === userId)
}

// 判断当前用户是否是群主
const isOwner = computed(() => {
  return groupInfo.value && groupInfo.value.creator_id === props.user.id
})

// 判断当前用户是否是管理员
const isCurrentUserAdmin = computed(() => {
  return isAdmin(props.user.id)
})

// 判断当前用户是否有移除成员的权限（群主或管理员）
const canRemoveMembers = computed(() => {
  return isOwner.value || isCurrentUserAdmin.value
})

// 判断是否可以撤回消息
const canRecallMessage = (msg) => {
  if (!msg) return false
  
  // 如果是自己发送的消息，可以撤回
  if (msg.sender_id === props.user.id) {
    return true
  }
  
  // 如果是群聊，检查是否有权限撤回他人消息
  if (currentChatInfo.value?.type === 'group') {
    // 群主可以撤回所有人的消息
    if (isOwner.value) {
      return true
    }
    
    // 管理员可以撤回普通成员的消息（不能撤回群主和其他管理员）
    if (isCurrentUserAdmin.value) {
      const senderId = msg.sender_id
      const creatorId = groupInfo.value?.creator_id
      
      // 不能撤回群主的消息
      if (senderId === creatorId) {
        return false
      }
      
      // 不能撤回其他管理员的消息
      if (isAdmin(senderId)) {
        return false
      }
      
      // 可以撤回普通成员的消息
      return true
    }
  }
  
  // 其他情况不能撤回
  return false
}

// 获取匹配字段的标签文本
const getMatchFieldLabel = (matchField) => {
  if (!matchField) return ''
  const labels = {
    'group_nickname': `群聊昵称：${matchField.value}`,
    'friend_remark': `备注：${matchField.value}`,
    'name': `昵称：${matchField.value}`,
    'username': `用户名：${matchField.value}`
  }
  return labels[matchField.type] || ''
}

// 获取群成员显示名称（优先级：群聊昵称 > 我对他人的备注 > 个人昵称 > 用户名）
const getMemberDisplayName = (member) => {
  if (!member) return '用户'
  
  // 判断是否设置了群聊昵称
  // 如果 group_nickname 等于 name，说明用户没有主动设置群昵称（系统自动填充的）
  const hasGroupNickname = member.group_nickname && 
                           String(member.group_nickname).trim() && 
                           member.group_nickname !== member.name
  
  // 1. 如果群成员设置了群聊昵称（且不等于个人昵称），优先以群聊昵称显示
  if (hasGroupNickname) {
    return member.group_nickname
  }
  
  // 2. 如果群成员没有设置群聊昵称，用当前用户登录，当前用户对该成员设置了备注，则显示备注
  // friend_remark 是当前用户对该成员的好友备注，可能为 null
  if (member.friend_remark && String(member.friend_remark).trim()) {
    return member.friend_remark
  }
  
  // 3. 如果群成员没有设置群聊昵称，当前用户也没有设置备注，则显示个人昵称
  if (member.name && String(member.name).trim()) {
    return member.name
  }
  
  // 4. 最后是用户名
  return member.username || '用户'
}

// 获取默认群聊名称（所有成员昵称用、分隔）
const getDefaultGroupName = () => {
  if (!groupMembers.value || groupMembers.value.length === 0) return '群聊'
  return groupMembers.value.map(m => getMemberDisplayName(m)).join('、')
}

// 打开添加群成员弹窗
const openAddGroupMemberModal = async () => {
  // 确保好友列表已加载
  if (!friendList.value || friendList.value.length === 0) {
    await loadFriendList()
  }
  
  // 过滤掉已经在群里的好友
  const existingMemberIds = new Set(groupMembers.value.map(m => m.user_id))
  allAddMemberContacts.value = allContacts.value.filter(contact => !existingMemberIds.has(contact.user_id))
  filteredAddMemberContacts.value = allAddMemberContacts.value
  addMemberSearchKeyword.value = ''
  selectedAddMembers.value.clear()
  
  showAddGroupMemberModal.value = true
}

// 关闭添加群成员弹窗
const closeAddGroupMemberModal = () => {
  showAddGroupMemberModal.value = false
  addMemberSearchKeyword.value = ''
  selectedAddMembers.value.clear()
}

// 过滤添加群成员的联系人
const filterAddMemberContacts = () => {
  const keyword = addMemberSearchKeyword.value.trim().toLowerCase()
  if (!keyword) {
    filteredAddMemberContacts.value = allAddMemberContacts.value
    return
  }
  filteredAddMemberContacts.value = allAddMemberContacts.value.filter(contact => {
    const displayName = contact.displayName || ''
    const username = contact.username || ''
    const name = contact.name || ''
    const remark = contact.remark || ''
    return displayName.toLowerCase().includes(keyword) ||
           username.toLowerCase().includes(keyword) ||
           name.toLowerCase().includes(keyword) ||
           remark.toLowerCase().includes(keyword)
  })
}

// 切换添加群成员选择
const toggleAddMemberSelection = (userId) => {
  if (selectedAddMembers.value.has(userId)) {
    selectedAddMembers.value.delete(userId)
  } else {
    selectedAddMembers.value.add(userId)
  }
}

// 打开群管理弹窗
const openGroupManagementModal = () => {
  showGroupManagementModal.value = true
}

// 关闭群管理弹窗
const closeGroupManagementModal = () => {
  showGroupManagementModal.value = false
}
// 打开选择新群主弹窗
const openTransferOwnershipModal = async () => {
  // 检查是否是群主
  if (groupInfo.value.creator_id !== props.user.id) {
    showToast('你不是群主，无法进行操作', 'error')
    closeGroupManagementModal()
    return
  }
  
  // 确保群成员列表已加载
  if (!groupMembers.value || groupMembers.value.length === 0) {
    if (currentChatInfo.value?.group_id) {
      try {
        const data = await group.getInfo(currentChatInfo.value.group_id)
        if (data.code === 200 && data.data && data.data.members) {
          groupMembers.value = data.data.members || []
        }
      } catch (e) {
        console.error('加载群成员列表失败:', e)
      }
    }
  }
  
  showTransferOwnershipModal.value = true
  transferOwnershipSearchKeyword.value = ''
  selectedNewOwner.value = null
  // 初始化群成员列表（排除自己）
  filteredTransferOwnershipMembers.value = groupMembers.value.filter(m => m.user_id !== props.user.id)
}

// 关闭选择新群主弹窗
const closeTransferOwnershipModal = () => {
  showTransferOwnershipModal.value = false
  transferOwnershipSearchKeyword.value = ''
  selectedNewOwner.value = null
}

// 过滤选择新群主的群成员
const filterTransferOwnershipMembers = () => {
  const keyword = transferOwnershipSearchKeyword.value.trim().toLowerCase()
  if (!keyword) {
    filteredTransferOwnershipMembers.value = groupMembers.value.filter(m => m.user_id !== props.user.id)
    return
  }
  
  filteredTransferOwnershipMembers.value = groupMembers.value
    .filter(m => m.user_id !== props.user.id) // 排除自己
    .filter(member => {
      const displayName = getMemberDisplayName(member).toLowerCase()
      return displayName.includes(keyword)
    })
}

// 切换选择新群主
const toggleTransferOwnershipSelection = (userId) => {
  if (selectedNewOwner.value === userId) {
    selectedNewOwner.value = null
  } else {
    selectedNewOwner.value = userId
  }
}

// 转让群主
const transferGroupOwnership = async () => {
  if (!selectedNewOwner.value) {
    showToast('请选择新群主', 'error')
    return
  }
  
  if (!currentChatInfo.value?.group_id) {
    showToast('群聊信息错误', 'error')
    return
  }
  
  transferringOwnership.value = true
  
  try {
    const data = await group.transferOwnership(currentChatInfo.value.group_id, selectedNewOwner.value)
    if (data.code === 200) {
      showToast('群主转让成功', 'success')
      closeTransferOwnershipModal()
      closeGroupManagementModal()
      
      // 刷新群聊信息
      await openGroupInfoModalById(currentChatInfo.value.group_id)
      
      // 刷新聊天列表
      await loadChatList()
      
      // 后端已经发送了系统通知，不需要前端再发送
    } else {
      showToast('群主转让失败: ' + (data.message || '未知错误'), 'error')
    }
  } catch (e) {
    console.error('群主转让失败:', e)
    showToast('群主转让失败，请重试', 'error')
  } finally {
    transferringOwnership.value = false
  }
}

// 打开群管理员弹窗
const openGroupAdminModal = async () => {
  // 检查是否是群主
  if (groupInfo.value.creator_id !== props.user.id) {
    showToast('你不是群主，无法进行操作', 'error')
    closeGroupManagementModal()
    return
  }
  
  showGroupAdminModal.value = true
  loadingAdmins.value = true
  
  try {
    if (!currentChatInfo.value?.group_id) {
      showToast('群聊信息错误', 'error')
      return
    }
    
    const data = await group.getAdmins(currentChatInfo.value.group_id)
    if (data.code === 200) {
      groupAdmins.value = data.data || []
    } else {
      showToast('加载管理员列表失败', 'error')
    }
  } catch (e) {
    console.error('加载管理员列表失败:', e)
    showToast('加载管理员列表失败', 'error')
  } finally {
    loadingAdmins.value = false
  }
}

// 关闭群管理员弹窗
const closeGroupAdminModal = () => {
  showGroupAdminModal.value = false
  groupAdmins.value = []
}

// 获取管理员显示名称
const getAdminDisplayName = (admin) => {
  // 优先级：群聊昵称 > 好友备注 > 个人昵称 > 用户名
  const groupNickname = admin.group_nickname
  const friendRemark = admin.friend_remark
  const name = admin.name
  const username = admin.username
  
  // 如果群聊昵称是默认值（等于name），忽略它
  if (groupNickname && groupNickname !== name) {
    return groupNickname
  }
  
  if (friendRemark && friendRemark.trim() && friendRemark !== username) {
    return friendRemark
  }
  
  if (name) {
    return name
  }
  
  return username || '用户'
}

// 打开选择群成员弹窗（用于添加管理员）
const openSelectAdminMembersModal = async () => {
  // 确保群成员列表已加载
  if (!groupMembers.value || groupMembers.value.length === 0) {
    if (currentChatInfo.value?.group_id) {
      try {
        const data = await group.getInfo(currentChatInfo.value.group_id)
        if (data.code === 200 && data.data && data.data.members) {
          groupMembers.value = data.data.members || []
        }
      } catch (e) {
        console.error('加载群成员列表失败:', e)
      }
    }
  }
  
  // 排除已经是管理员的成员和群主
  const adminUserIds = new Set(groupAdmins.value.map(a => a.user_id))
  adminUserIds.add(groupInfo.value.creator_id)
  
  filteredSelectAdminMembers.value = groupMembers.value.filter(m => !adminUserIds.has(m.user_id))
  selectAdminMembersSearchKeyword.value = ''
  selectedAdminMembers.value.clear()
  
  showSelectAdminMembersModal.value = true
}

// 关闭选择群成员弹窗
const closeSelectAdminMembersModal = () => {
  showSelectAdminMembersModal.value = false
  selectAdminMembersSearchKeyword.value = ''
  selectedAdminMembers.value.clear()
}

// 过滤选择群成员
const filterSelectAdminMembers = () => {
  const keyword = selectAdminMembersSearchKeyword.value.trim().toLowerCase()
  const adminUserIds = new Set(groupAdmins.value.map(a => a.user_id))
  adminUserIds.add(groupInfo.value.creator_id)
  
  if (!keyword) {
    filteredSelectAdminMembers.value = groupMembers.value.filter(m => !adminUserIds.has(m.user_id))
    return
  }
  
  filteredSelectAdminMembers.value = groupMembers.value
    .filter(m => !adminUserIds.has(m.user_id))
    .filter(member => {
      const displayName = getMemberDisplayName(member).toLowerCase()
      return displayName.includes(keyword)
    })
}

// 切换选择群成员
const toggleSelectAdminMemberSelection = (userId) => {
  if (selectedAdminMembers.value.has(userId)) {
    selectedAdminMembers.value.delete(userId)
  } else {
    selectedAdminMembers.value.add(userId)
  }
}

// 确认添加管理员
const confirmAddAdmins = async () => {
  if (selectedAdminMembers.value.size === 0) {
    showToast('请至少选择一个群成员', 'error')
    return
  }
  
  if (!currentChatInfo.value?.group_id) {
    showToast('群聊信息错误', 'error')
    return
  }
  
  addingAdmins.value = true
  
  try {
    const user_ids = Array.from(selectedAdminMembers.value)
    const data = await group.addAdmins(currentChatInfo.value.group_id, user_ids)
    if (data.code === 200) {
      showToast('添加管理员成功', 'success')
      closeSelectAdminMembersModal()
      
      // 刷新管理员列表
      const adminData = await group.getAdmins(currentChatInfo.value.group_id)
      if (adminData.code === 200) {
        groupAdmins.value = adminData.data || []
      }
      
      // 刷新聊天列表（系统通知会更新最后一条消息）
      await loadChatList()
    } else {
      showToast('添加管理员失败: ' + (data.message || '未知错误'), 'error')
    }
  } catch (e) {
    console.error('添加管理员失败:', e)
    showToast('添加管理员失败，请重试', 'error')
  } finally {
    addingAdmins.value = false
  }
}

// 打开移除管理员确认弹窗
const openRemoveAdminConfirm = (admin) => {
  adminToRemove.value = admin
  showRemoveAdminConfirm.value = true
}

// 确认移除管理员
const confirmRemoveAdmin = async () => {
  if (!adminToRemove.value || !currentChatInfo.value?.group_id) {
    showToast('参数错误', 'error')
    return
  }
  
  removingAdmin.value = true
  
  try {
    const data = await group.removeAdmin(currentChatInfo.value.group_id, adminToRemove.value.user_id)
    if (data.code === 200) {
      showToast('移除管理员成功', 'success')
      showRemoveAdminConfirm.value = false
      adminToRemove.value = null
      
      // 刷新管理员列表
      const adminData = await group.getAdmins(currentChatInfo.value.group_id)
      if (adminData.code === 200) {
        groupAdmins.value = adminData.data || []
      }
      
      // 刷新聊天列表（系统通知会更新最后一条消息）
      await loadChatList()
    } else {
      showToast('移除管理员失败: ' + (data.message || '未知错误'), 'error')
    }
  } catch (e) {
    console.error('移除管理员失败:', e)
    showToast('移除管理员失败，请重试', 'error')
  } finally {
    removingAdmin.value = false
  }
}

// 打开移除成员弹窗
const openRemoveGroupMemberModal = async () => {
  // 检查权限
  if (!canRemoveMembers.value) {
    showToast('你没有移除成员的权限', 'error')
    return
  }
  
  // 确保群成员列表已加载
  if (!groupMembers.value || groupMembers.value.length === 0) {
    if (currentChatInfo.value?.group_id) {
      try {
        const data = await group.getInfo(currentChatInfo.value.group_id)
        if (data.code === 200 && data.data && data.data.members) {
          groupMembers.value = data.data.members || []
        }
      } catch (e) {
        console.error('加载群成员列表失败:', e)
      }
    }
  }
  
  // 确保管理员列表已加载
  if (groupAdmins.value.length === 0 && currentChatInfo.value?.group_id) {
    try {
      const adminData = await group.getAdmins(currentChatInfo.value.group_id)
      if (adminData.code === 200) {
        groupAdmins.value = adminData.data || []
      }
    } catch (e) {
      console.error('加载管理员列表失败:', e)
    }
  }
  
  // 根据权限过滤成员
  const creatorId = groupInfo.value?.creator_id
  const currentUserId = props.user.id
  
  if (isOwner.value) {
    // 群主：排除自己（不能移除自己）
    filteredRemoveMembers.value = groupMembers.value.filter(m => m.user_id !== currentUserId)
  } else if (isCurrentUserAdmin.value) {
    // 管理员：只显示普通成员（排除群主、其他管理员和自己）
    const adminUserIds = new Set(groupAdmins.value.map(a => a.user_id))
    adminUserIds.add(creatorId) // 排除群主
    adminUserIds.add(currentUserId) // 排除自己
    filteredRemoveMembers.value = groupMembers.value.filter(m => !adminUserIds.has(m.user_id))
  } else {
    // 普通成员：不应该看到这个按钮，但为了安全起见，直接返回
    showToast('你没有移除成员的权限', 'error')
    return
  }
  
  removeMemberSearchKeyword.value = ''
  selectedRemoveMembers.value.clear()
  
  showRemoveGroupMemberModal.value = true
}

// 关闭移除成员弹窗
const closeRemoveGroupMemberModal = () => {
  showRemoveGroupMemberModal.value = false
  removeMemberSearchKeyword.value = ''
  selectedRemoveMembers.value.clear()
}

// 过滤移除成员
const filterRemoveMembers = () => {
  const keyword = removeMemberSearchKeyword.value.trim().toLowerCase()
  const creatorId = groupInfo.value?.creator_id
  const currentUserId = props.user.id
  
  // 根据权限过滤成员
  let allMembers = []
  if (isOwner.value) {
    // 群主：排除自己（不能移除自己）
    allMembers = groupMembers.value.filter(m => m.user_id !== currentUserId)
  } else if (isCurrentUserAdmin.value) {
    // 管理员：只显示普通成员（排除群主、其他管理员和自己）
    const adminUserIds = new Set(groupAdmins.value.map(a => a.user_id))
    adminUserIds.add(creatorId) // 排除群主
    adminUserIds.add(currentUserId) // 排除自己
    allMembers = groupMembers.value.filter(m => !adminUserIds.has(m.user_id))
  } else {
    // 普通成员：不应该看到这个弹窗，但为了安全起见，返回空列表
    filteredRemoveMembers.value = []
    return
  }
  
  if (!keyword) {
    filteredRemoveMembers.value = allMembers
    return
  }
  
  filteredRemoveMembers.value = allMembers.filter(member => {
    const displayName = getMemberDisplayName(member) || ''
    return displayName.toLowerCase().includes(keyword)
  })
}

// 切换移除成员选择
const toggleRemoveMemberSelection = (userId) => {
  if (selectedRemoveMembers.value.has(userId)) {
    selectedRemoveMembers.value.delete(userId)
  } else {
    selectedRemoveMembers.value.clear() // 一次只能选择一个
    selectedRemoveMembers.value.add(userId)
  }
}

// 确认移除成员（打开确认弹窗）
const confirmRemoveMembers = () => {
  if (selectedRemoveMembers.value.size === 0) {
    showToast('请至少选择一个群成员', 'error')
    return
  }
  
  // 一次只能移除一个成员
  const userId = Array.from(selectedRemoveMembers.value)[0]
  const member = groupMembers.value.find(m => m.user_id === userId)
  if (member) {
    pendingRemoveMemberId.value = userId
    pendingRemoveMemberDisplayName.value = getMemberDisplayName(member)
    showRemoveMemberConfirm.value = true
    closeRemoveGroupMemberModal()
  }
}

// 执行移除成员
const executeRemoveMember = async () => {
  if (!pendingRemoveMemberId.value || !currentChatInfo.value?.group_id) {
    showToast('参数错误', 'error')
    return
  }
  
  removingMembers.value = true
  
  try {
    const data = await group.removeMember(currentChatInfo.value.group_id, pendingRemoveMemberId.value)
    if (data.code === 200) {
      showToast(`移出${pendingRemoveMemberDisplayName.value}成功`, 'success')
      showRemoveMemberConfirm.value = false
      pendingRemoveMemberId.value = null
      pendingRemoveMemberDisplayName.value = ''
      
      // 重新加载群聊信息（更新成员数）
      await openGroupInfoModal()
      // 刷新聊天列表（系统通知会更新最后一条消息）
      await loadChatList()
    } else {
      showToast('移除成员失败: ' + (data.message || '未知错误'), 'error')
    }
  } catch (e) {
    console.error('移除成员失败:', e)
    showToast('移除成员失败，请重试', 'error')
  } finally {
    removingMembers.value = false
  }
}

// 添加群成员
const addGroupMembers = async () => {
  if (selectedAddMembers.value.size === 0) {
    showToast('请至少选择一个联系人', 'error')
    return
  }
  
  addingMembers.value = true
  
  try {
    const groupId = currentChatInfo.value.group_id
    const userList = Array.from(selectedAddMembers.value).map(userId => {
      const contact = allAddMemberContacts.value.find(c => c.user_id === userId)
      return {
        id: userId,
        name: contact?.name || contact?.username || '用户'
      }
    })
    
    const data = await group.invite(groupId, userList)
    if (data.code === 200) {
      showToast('添加成员成功', 'success')
      closeAddGroupMemberModal()
      // 重新加载群聊信息
      await openGroupInfoModal()
      // 刷新聊天列表
      await loadChatList()
    } else {
      showToast('添加成员失败: ' + (data.message || '未知错误'), 'error')
    }
  } catch (e) {
    console.error('添加群成员失败:', e)
    showToast('添加群成员失败，请重试', 'error')
  } finally {
    addingMembers.value = false
  }
}

// 选择群聊头像
const selectGroupInfoAvatar = () => {
  groupInfoAvatarInput.value?.click()
}

// 处理群聊头像选择
const handleGroupInfoAvatarSelect = async (event) => {
  const file = event.target.files[0]
  if (!file) return
  
  // 验证文件类型
  if (!file.type.startsWith('image/')) {
    showToast('请选择图片文件', 'error')
    if (groupInfoAvatarInput.value) {
      groupInfoAvatarInput.value.value = ''
    }
    return
  }
  
  // 验证文件大小（限制为5MB）
  if (file.size > 5 * 1024 * 1024) {
    showToast('图片大小不能超过5MB', 'error')
    if (groupInfoAvatarInput.value) {
      groupInfoAvatarInput.value.value = ''
    }
    return
  }
  
  // 读取文件并显示裁剪对话框
  const reader = new FileReader()
  reader.onload = (e) => {
    groupInfoAvatarCropperSrc.value = e.target.result
    showGroupInfoAvatarCropper.value = true
  }
  reader.readAsDataURL(file)
}

// 群聊信息头像裁剪确认
const handleGroupInfoAvatarCropConfirm = async (croppedFile) => {
  showGroupInfoAvatarCropper.value = false
  groupInfoAvatarCropperSrc.value = ''
  groupInfoAvatarFile.value = croppedFile
  
  try {
    const groupId = currentChatInfo.value.group_id
    const data = await group.updateAvatar(groupId, croppedFile)
    if (data.code === 200) {
      showToast('群聊头像更新成功', 'success')
      // 重新加载群聊信息
      await openGroupInfoModal()
      // 刷新聊天列表
      await loadChatList()
    } else {
      showToast('更新群聊头像失败: ' + (data.message || '未知错误'), 'error')
    }
  } catch (e) {
    console.error('更新群聊头像失败:', e)
    showToast('更新群聊头像失败，请重试', 'error')
  }
  
  // 清空文件输入
  if (groupInfoAvatarInput.value) {
    groupInfoAvatarInput.value.value = ''
  }
  groupInfoAvatarFile.value = null
}

// 群聊信息头像裁剪取消
const handleGroupInfoAvatarCropCancel = () => {
  showGroupInfoAvatarCropper.value = false
  groupInfoAvatarCropperSrc.value = ''
  // 清空文件输入
  if (groupInfoAvatarInput.value) {
    groupInfoAvatarInput.value.value = ''
  }
  groupInfoAvatarFile.value = null
}

// 开始编辑群聊名称
const startEditGroupName = () => {
  editingGroupName.value = true
  // 如果群聊名称为空，编辑时显示空字符串（表示使用默认名称）
  editingGroupNameValue.value = groupInfo.value.name || ''
  nextTick(() => {
    groupNameInput.value?.focus()
  })
}

// 保存群聊名称
const saveGroupName = async () => {
  const newName = editingGroupNameValue.value.trim()
  const oldName = groupInfo.value.name || ''
  
  // 如果没有变化，直接取消编辑
  if (newName === oldName) {
    cancelEditGroupName()
    return
  }
  
  try {
    const groupId = currentChatInfo.value.group_id
    // 如果newName为空字符串，发送null表示使用默认名称
    const nameToSend = (newName && newName.trim() !== '') ? newName.trim() : null
    const data = await group.updateName(groupId, nameToSend)
    if (data.code === 200) {
      const finalName = newName || getDefaultGroupName()
      const oldDisplayName = oldName || getDefaultGroupName()
      // 保存实际输入的值（空字符串表示使用默认名称）
      groupInfo.value.name = newName ? newName.trim() : null
      
      // 如果有修改，发送系统通知
      if (finalName !== oldDisplayName) {
        await sendSystemNotification(`${getUserDisplayName()} 修改了群聊名称为 ${finalName}`)
      }
      
      showToast('群聊名称更新成功', 'success')
      editingGroupName.value = false
      
      // 刷新聊天列表
      await loadChatList()
      // 更新当前聊天信息（如果有备注则使用备注，否则使用最终名称）
      if (currentChatInfo.value) {
        const displayName = currentChatInfo.value.remark || finalName
        currentChatInfo.value.name = displayName
      }
    } else {
      showToast('更新群聊名称失败: ' + (data.message || '未知错误'), 'error')
    }
  } catch (e) {
    console.error('更新群聊名称失败:', e)
    showToast('更新群聊名称失败，请重试', 'error')
  }
}

// 取消编辑群聊名称
const cancelEditGroupName = () => {
  editingGroupName.value = false
  editingGroupNameValue.value = ''
}

// 开始编辑群聊备注
const startEditGroupRemark = () => {
  editingGroupRemark.value = true
  editingGroupRemarkValue.value = groupRemark.value || ''
  nextTick(() => {
    groupRemarkInput.value?.focus()
  })
}

// 保存群聊备注
const saveGroupRemark = async () => {
  const newRemark = editingGroupRemarkValue.value.trim()
  
  try {
    const groupId = currentChatInfo.value.group_id
    const data = await group.updateRemark(groupId, newRemark)
    if (data.code === 200) {
      groupRemark.value = newRemark
      showToast('备注更新成功', 'success')
      editingGroupRemark.value = false
      
      // 刷新聊天列表（备注会影响显示）
      await loadChatList()
      // 更新当前聊天信息
      if (currentChatInfo.value && newRemark) {
        currentChatInfo.value.name = newRemark
      }
    } else {
      showToast('更新备注失败: ' + (data.message || '未知错误'), 'error')
    }
  } catch (e) {
    console.error('更新备注失败:', e)
    showToast('更新备注失败，请重试', 'error')
  }
}

// 取消编辑群聊备注
const cancelEditGroupRemark = () => {
  editingGroupRemark.value = false
  editingGroupRemarkValue.value = ''
}

// 开始编辑群昵称
const startEditGroupNickname = () => {
  editingGroupNickname.value = true
  editingGroupNicknameValue.value = myGroupNickname.value || ''
  nextTick(() => {
    groupNicknameInput.value?.focus()
  })
}

// 保存群昵称
const saveGroupNickname = async () => {
  const newNickname = editingGroupNicknameValue.value.trim()
  
  try {
    const groupId = currentChatInfo.value.group_id
    const data = await group.updateNickname(groupId, newNickname || null) // null表示使用原昵称
    if (data.code === 200) {
      myGroupNickname.value = newNickname
      showToast('群昵称更新成功', 'success')
      editingGroupNickname.value = false
      
      // 重新加载群聊信息
      await openGroupInfoModal()
    } else {
      showToast('更新群昵称失败: ' + (data.message || '未知错误'), 'error')
    }
  } catch (e) {
    console.error('更新群昵称失败:', e)
    showToast('更新群昵称失败，请重试', 'error')
  }
}

// 取消编辑群昵称
const cancelEditGroupNickname = () => {
  editingGroupNickname.value = false
  editingGroupNicknameValue.value = ''
}

// 打开群公告弹窗
const openAnnouncementModal = async () => {
  if (!currentChatInfo.value || currentChatInfo.value.type !== 'group') return
  
  const groupId = currentChatInfo.value.group_id
  showAnnouncementModal.value = true
  
  // 如果群聊信息已加载，使用已有的公告内容；否则重新加载
  if (groupInfo.value && groupInfo.value.id === groupId) {
    announcementContent.value = groupInfo.value.announcement || ''
  } else {
    try {
      const data = await group.getInfo(groupId)
      if (data.code === 200 && data.data) {
        announcementContent.value = data.data.announcement || ''
      }
    } catch (e) {
      console.error('加载群公告失败:', e)
      announcementContent.value = ''
    }
  }
}

// 从右侧面板打开群公告弹窗（用于通讯录选项卡）
const openAnnouncementModalFromRightPanel = async () => {
  // 如果当前有群聊信息，使用群聊信息的ID
  const groupId = groupInfo.value?.id
  if (!groupId) {
    showToast('群聊信息加载中，请稍候', 'error')
    return
  }
  
  showAnnouncementModal.value = true
  
  // 如果群聊信息已加载，使用已有的公告内容；否则重新加载
  if (groupInfo.value && groupInfo.value.announcement !== undefined) {
    announcementContent.value = groupInfo.value.announcement || ''
  } else {
    try {
      const data = await group.getInfo(groupId)
      if (data.code === 200 && data.data) {
        announcementContent.value = data.data.announcement || ''
      }
    } catch (e) {
      console.error('加载群公告失败:', e)
      announcementContent.value = ''
    }
  }
}

// 关闭群公告弹窗
const closeAnnouncementModal = () => {
  showAnnouncementModal.value = false
  announcementContent.value = ''
}

// 保存群公告（显示确认发布弹窗）
const saveAnnouncement = () => {
  showAnnouncementPublishConfirm.value = true
}

// 发布群公告
const publishAnnouncement = async () => {
  // 优先使用 currentChatInfo，如果没有则使用 groupInfo（通讯录选项卡下）
  let groupId = null
  if (currentChatInfo.value && currentChatInfo.value.type === 'group') {
    groupId = currentChatInfo.value.group_id
  } else if (groupInfo.value && groupInfo.value.id) {
    groupId = groupInfo.value.id
  }
  
  if (!groupId) {
    showToast('无法获取群聊信息', 'error')
    return
  }
  
  // 检查权限：只有群主和管理员可以发布群公告
  // 获取群聊信息和管理员列表
  let currentGroupInfo = null
  if (groupInfo.value && groupInfo.value.id === groupId) {
    currentGroupInfo = groupInfo.value
  } else {
    try {
      const data = await group.getInfo(groupId)
      if (data.code === 200 && data.data) {
        currentGroupInfo = data.data
      }
    } catch (e) {
      console.error('加载群聊信息失败:', e)
    }
  }
  
  // 检查是否是群主
  const isGroupOwner = currentGroupInfo && currentGroupInfo.creator_id === props.user.id
  
  // 检查是否是管理员
  let isGroupAdmin = false
  if (currentGroupInfo) {
    // 如果管理员列表已加载且是当前群聊，直接检查；否则需要加载
    if (groupAdmins.value.length > 0) {
      // 检查管理员列表是否属于当前群聊
      const firstAdmin = groupAdmins.value[0]
      if (firstAdmin && (firstAdmin.group_id === groupId || groupInfo.value?.id === groupId)) {
        isGroupAdmin = isAdmin(props.user.id)
      } else {
        // 管理员列表不是当前群聊的，需要重新加载
        try {
          const adminData = await group.getAdmins(groupId)
          if (adminData.code === 200 && adminData.data) {
            groupAdmins.value = adminData.data || []
            isGroupAdmin = isAdmin(props.user.id)
          }
        } catch (e) {
          console.error('加载管理员列表失败:', e)
        }
      }
    } else {
      // 管理员列表为空，需要加载
      try {
        const adminData = await group.getAdmins(groupId)
        if (adminData.code === 200 && adminData.data) {
          groupAdmins.value = adminData.data || []
          isGroupAdmin = isAdmin(props.user.id)
        }
      } catch (e) {
        console.error('加载管理员列表失败:', e)
      }
    }
  }
  
  if (!isGroupOwner && !isGroupAdmin) {
    showToast('你不是群主或管理员，无法进行操作', 'error')
    showAnnouncementPublishConfirm.value = false
    return
  }
  
  publishingAnnouncement.value = true
  
  try {
    // 先更新群公告
    const updateData = await group.updateAnnouncement(groupId, announcementContent.value)
    if (updateData.code !== 200) {
      showToast(updateData.message || '保存群公告失败', 'error')
      publishingAnnouncement.value = false
      return
    }
    
    // 发布群公告（发送消息到聊天区）
    const publishData = await group.publishAnnouncement(groupId)
    if (publishData.code === 200) {
      showToast('群公告发布成功', 'success')
      showAnnouncementPublishConfirm.value = false
      closeAnnouncementModal()
      
      // 刷新群聊信息
      // 如果在通讯录选项卡下，刷新右侧面板的群聊信息
      if (currentTab.value === 'contact' && rightPanelView.value === 'groupInfo' && groupInfo.value && groupInfo.value.id === groupId) {
        try {
          const data = await group.getInfo(groupId)
          if (data.code === 200 && data.data) {
            groupInfo.value = data.data
            groupMembers.value = data.data.members || []
            announcementContent.value = data.data.announcement || ''
            filterGroupMembers()
          }
        } catch (e) {
          console.error('刷新群聊信息失败:', e)
        }
      } else if (currentChatInfo.value && currentChatInfo.value.type === 'group') {
        await openGroupInfoModal()
      }
      
      // 刷新聊天列表
      await loadChatList()
      
      // 如果当前正在查看该群聊，立即从后端获取最新的群公告内容并手动添加消息
      // 这样可以确保使用后端返回的正确内容（包含正确的换行符），而不依赖WebSocket
      if (currentChatInfo.value && currentRoom.value === currentChatInfo.value.room && publishData.data && publishData.data.message_id) {
        const messageId = publishData.data.message_id
        const existingMsg = messages.value.find(msg => msg.id === messageId)
        
        if (!existingMsg) {
          // 获取当前用户的显示名称（群聊昵称或用户名）
          let displayNickname = props.user.name || props.user.username || '用户'
          if (currentChatInfo.value.type === 'group') {
            const member = groupMembers.value.find(m => m.user_id === props.user.id)
            if (member) {
              displayNickname = getMemberDisplayName(member)
            }
          }
          
          // 从后端重新获取群公告内容，确保换行符正确
          // 使用后端返回的公告内容，而不是前端的 announcementContent.value
          try {
            const groupData = await group.getInfo(groupId)
            if (groupData.code === 200 && groupData.data && groupData.data.announcement) {
              // 构建群公告消息内容，使用后端返回的公告内容
              // 统一处理换行符：将 \r\n 转换为 \n，确保换行符格式一致
              const announcementText = String(groupData.data.announcement || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
              const messageContent = '群公告\n' + announcementText
              
              // 手动添加消息到列表
              console.log('手动添加: 添加新消息。content:', JSON.stringify(messageContent))
              const newMsg = {
                id: messageId,
                sender_id: props.user.id,
                receiver_id: currentChatInfo.value.group_id,
                content: messageContent,
                room: currentChatInfo.value.room,
                type: 'group',
                media_type: 'text',
                created_at: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
                is_recalled: 0,
                nickname: displayNickname,
                name: props.user.name || props.user.username || '用户',
                username: props.user.username || '',
                avatar: props.user.avatar || '',
                is_blocked: 0,
                requires_verification: 0
              }
              
              messages.value.push(newMsg)
              scrollToBottom()
            }
          } catch (e) {
            console.error('获取群公告内容失败:', e)
            // 如果获取失败，仍然尝试使用前端的值（作为后备方案）
            // 统一处理换行符：将 \r\n 转换为 \n，确保换行符格式一致
            const announcementText = String(announcementContent.value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
            const messageContent = '群公告\n' + announcementText
            
            const newMsg = {
              id: messageId,
              sender_id: props.user.id,
              receiver_id: currentChatInfo.value.group_id,
              content: messageContent,
              room: currentChatInfo.value.room,
              type: 'group',
              media_type: 'text',
              created_at: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
              is_recalled: 0,
              nickname: displayNickname,
              name: props.user.name || props.user.username || '用户',
              username: props.user.username || '',
              avatar: props.user.avatar || '',
              is_blocked: 0,
              requires_verification: 0
            }
            
            messages.value.push(newMsg)
            scrollToBottom()
          }
        } else {
          // 消息已存在（可能是WebSocket已经添加了），更新消息内容以确保换行符正确
          try {
            const groupData = await group.getInfo(groupId)
            if (groupData.code === 200 && groupData.data && groupData.data.announcement) {
              // 统一处理换行符：将 \r\n 转换为 \n，确保换行符格式一致
              const announcementText = String(groupData.data.announcement || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
              const messageContent = '群公告\n' + announcementText
              
              // 更新已存在消息的内容
              const msgIndex = messages.value.findIndex(msg => msg.id === messageId)
              if (msgIndex !== -1) {
                console.log('手动添加: 消息已存在，更新消息内容。更新前content:', JSON.stringify(messages.value[msgIndex].content))
                // 使用Vue的响应式更新方式，确保视图更新
                messages.value[msgIndex] = {
                  ...messages.value[msgIndex],
                  content: messageContent
                }
                console.log('手动添加: 更新后content:', JSON.stringify(messages.value[msgIndex].content))
                // 强制触发Vue的响应式更新
                messages.value = [...messages.value]
              }
            }
          } catch (e) {
            console.error('更新群公告消息内容失败:', e)
          }
          scrollToBottom()
        }
      }
    } else {
      showToast(publishData.message || '发布群公告失败', 'error')
    }
  } catch (e) {
    console.error('发布群公告失败:', e)
    showToast('发布群公告失败，请重试', 'error')
  } finally {
    publishingAnnouncement.value = false
  }
}

// 处理点击外部区域关闭编辑状态
const handleClickOutsideEdit = (event) => {
  // 只有在群聊信息弹窗打开时才处理
  if (!showGroupInfoModal.value) {
    return
  }
  
  // 检查是否点击在编辑区域内
  const clickedElement = event.target
  
  // 检查是否点击在显示区域（点击显示区域应该开启编辑，不应该关闭）
  const isDisplayElement = clickedElement.closest('.group-info-name-display') || 
                          clickedElement.closest('.group-info-remark-display') || 
                          clickedElement.closest('.group-info-nickname-display')
  if (isDisplayElement) {
    return
  }
  
  // 检查是否点击在群聊名称编辑区域
  if (editingGroupName.value && groupNameEditRef.value) {
    if (!groupNameEditRef.value.contains(clickedElement)) {
      cancelEditGroupName()
    }
  }
  
  // 检查是否点击在备注编辑区域
  if (editingGroupRemark.value && groupRemarkEditRef.value) {
    if (!groupRemarkEditRef.value.contains(clickedElement)) {
      cancelEditGroupRemark()
    }
  }
  
  // 检查是否点击在群昵称编辑区域
  if (editingGroupNickname.value && groupNicknameEditRef.value) {
    if (!groupNicknameEditRef.value.contains(clickedElement)) {
      cancelEditGroupNickname()
    }
  }
}

// 发送消息给群聊
const sendMessageToGroup = async () => {
  if (!groupInfo.value || !groupInfo.value.id) {
    return
  }
  
  const groupId = groupInfo.value.id
  
  // 关闭群聊信息弹窗
  closeGroupInfoModal()
  
  // 在聊天列表中查找是否已有该群聊的聊天
  const existingChat = chatList.value.find(item => {
    return item.type === 'group' && 
           item.chat_type === 'group' && 
           (item.group_id === groupId || item.id === groupId)
  })
  
  if (existingChat) {
    // 如果已有聊天，直接打开
    await selectChat(existingChat)
  } else {
    // 如果没有聊天记录，从groupInfo中获取room
    if (groupInfo.value.room) {
      // 创建聊天项并打开
      const chatItem = {
        room: groupInfo.value.room,
        type: 'group',
        chat_type: 'group',
        group_id: groupId,
        id: groupId,
        name: groupInfo.value.name || '群聊',
        remark: groupInfo.value.user_remark || '',
        member_count: groupInfo.value.member_count || groupMembers.value.length
      }
      await selectChat(chatItem)
    } else {
      showToast('无法找到聊天房间，请稍后重试', 'error')
    }
  }
}

// 从右侧面板发送消息给群聊（用于通讯录选项卡）
const sendMessageToGroupFromRightPanel = async () => {
  if (!groupInfo.value || !groupInfo.value.id) {
    return
  }
  
  const groupId = groupInfo.value.id
  
  // 切换到聊天选项卡
  currentTab.value = 'chat'
  
  // 在聊天列表中查找是否已有该群聊的聊天
  const existingChat = chatList.value.find(item => {
    return item.type === 'group' && 
           item.chat_type === 'group' && 
           (item.group_id === groupId || item.id === groupId)
  })
  
  if (existingChat) {
    // 如果已有聊天，直接打开
    await selectChat(existingChat)
  } else {
    // 如果没有聊天记录，从groupInfo中获取room
    if (groupInfo.value.room) {
      // 创建聊天项并打开
      const chatItem = {
        room: groupInfo.value.room,
        type: 'group',
        chat_type: 'group',
        group_id: groupId,
        id: groupId,
        name: groupInfo.value.name || '群聊',
        remark: groupInfo.value.user_remark || '',
        member_count: groupInfo.value.member_count || groupMembers.value.length
      }
      await selectChat(chatItem)
    } else {
      showToast('无法找到聊天房间，请稍后重试', 'error')
    }
  }
}

// 退出群聊
const leaveGroup = async () => {
  showLeaveGroupConfirm.value = false
  
  try {
    const groupId = currentChatInfo.value.group_id
    const data = await group.leave(groupId)
    if (data.code === 200) {
      showToast('已退出群聊', 'success')
      
      // 关闭群聊信息弹窗
      closeGroupInfoModal()
      
      // 刷新聊天列表
      await loadChatList()
      // 刷新通讯录选项卡下的群聊列表（退出后从通讯录中移除）
      await loadGroupChatListForContact()
      
      // 切换到聊天列表的第一个聊天（如果有）
      if (chatList.value.length > 0) {
        await selectChat(chatList.value[0])
      } else {
        // 如果没有聊天，清空当前聊天信息
        currentChatInfo.value = null
        currentRoom.value = null
        messages.value = []
      }
    } else {
      showToast('退出群聊失败: ' + (data.message || '未知错误'), 'error')
    }
  } catch (e) {
    console.error('退出群聊失败:', e)
    showToast('退出群聊失败，请重试', 'error')
  }
}

// 解散群聊
const disbandGroup = async () => {
  // 检查是否是群主
  if (!groupInfo.value || groupInfo.value.creator_id !== props.user.id) {
    showToast('你不是群主，无法进行操作', 'error')
    showDisbandGroupConfirm.value = false
    closeGroupManagementModal()
    return
  }
  
  // 从 groupInfo 中获取群聊ID，因为解散操作是从群聊信息弹窗触发的
  if (!groupInfo.value.id) {
    showToast('群聊信息错误', 'error')
    showDisbandGroupConfirm.value = false
    closeGroupManagementModal()
    return
  }
  
  disbandingGroup.value = true
  
  try {
    const groupId = groupInfo.value.id
    const data = await group.disband(groupId)
    if (data.code === 200) {
      showToast('群聊已解散', 'success')
      
      // 关闭弹窗
      showDisbandGroupConfirm.value = false
      closeGroupManagementModal()
      closeGroupInfoModal()
      
      // 刷新聊天列表（已解散的群聊会从通讯录中删除，但保留在聊天列表中）
      await loadChatList()
      // 刷新通讯录选项卡下的群聊列表（已解散的群聊会被移除）
      await loadGroupChatListForContact()
    } else {
      showToast('解散群聊失败: ' + (data.message || '未知错误'), 'error')
      if (data.code === 4003) {
        // 不是群主
        showDisbandGroupConfirm.value = false
        closeGroupManagementModal()
      }
    }
  } catch (e) {
    console.error('解散群聊失败:', e)
    showToast('解散群聊失败，请重试', 'error')
  } finally {
    disbandingGroup.value = false
  }
}

// 获取用户显示名称（用于系统通知）
// 如果是群聊，优先使用群聊昵称，然后是备注，然后是个人昵称，最后是用户名
const getUserDisplayName = () => {
  // 如果是群聊，从群成员信息中获取当前用户的显示名称
  if (currentChatInfo.value?.type === 'group' && groupMembers.value.length > 0) {
    const currentUserMember = groupMembers.value.find(m => m.user_id === props.user.id)
    if (currentUserMember) {
      return getMemberDisplayName(currentUserMember)
    }
  }
  // 如果不是群聊或找不到群成员信息，使用个人昵称或用户名
  return props.user?.name || props.user?.username || '用户'
}

// 发送系统通知（特殊类型的消息，居中显示，不显示在聊天记录）
const sendSystemNotification = async (content) => {
  if (!currentRoom.value) return
  
  try {
    // 通过WebSocket发送系统通知消息
    // 系统通知消息类型为 'system'
    if (ws.value && ws.value.readyState === WebSocket.OPEN) {
      ws.value.send(JSON.stringify({
        type: 'system',
        content: content,
        room: currentRoom.value,
        sender_id: props.user.id
      }))
    } else {
      // 如果WebSocket未连接，直接添加到消息列表（用于本地显示）
      const systemMsg = {
        id: `system_${Date.now()}_${Math.random()}`,
        type: 'system',
        content: content,
        room: currentRoom.value,
        sender_id: props.user.id,
        created_at: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
      }
      messages.value.push(systemMsg)
      scrollToBottom()
    }
  } catch (e) {
    console.error('发送系统通知失败:', e)
    // 如果发送失败，也直接添加到消息列表
    const systemMsg = {
      id: `system_${Date.now()}_${Math.random()}`,
      type: 'system',
      content: content,
      room: currentRoom.value,
      sender_id: props.user.id,
      created_at: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    }
    messages.value.push(systemMsg)
    scrollToBottom()
  }
}
const loadFriendRequests = async () => {
  try {
    const data = await friend.getRequests()
    if (data.code === 200) {
      const sentList = data.data?.sent || []
      const receivedList = data.data?.received || []

      if (friendRequestsLoadedOnce.value) {
        const previousStatuses = previousSentRequestStatuses.value || {}
        let shouldRefreshLists = false
        sentList.forEach(request => {
          const prevStatus = previousStatuses[request.id]
          if (prevStatus === 'pending' && request.status === 'accepted') {
            const name = request.receiver?.name || request.receiver?.username || '对方'
            showToast(`${name}已同意你的好友申请`, 'success')
            shouldRefreshLists = true
          } else if (prevStatus === 'pending' && request.status === 'rejected') {
            const name = request.receiver?.name || request.receiver?.username || '对方'
            showToast(`${name}已拒绝你的好友申请`, 'error')
          }
        })
        
        // 检测新的收到的申请
        receivedList.forEach(request => {
          if (request.status === 'pending' && !previousReceivedRequestIds.value.has(request.id)) {
            const name = request.sender?.name || request.sender?.username || '用户'
            showToast(`${name}申请添加你为好友`, 'success')
          }
        })
        
        // 如果有申请被同意，刷新好友列表和聊天列表
        if (shouldRefreshLists) {
          await loadFriendList()
          await loadChatList()
        }
      }

      previousSentRequestStatuses.value = sentList.reduce((acc, item) => {
        acc[item.id] = item.status
        return acc
      }, {})
      
      // 更新已收到的申请ID集合
      previousReceivedRequestIds.value = new Set(receivedList.map(item => item.id))

      sentFriendRequests.value = sentList.filter(item => item.status === 'pending')
      receivedFriendRequests.value = receivedList.filter(item => item.status === 'pending')

      pendingOutgoingUserIds.value = sentFriendRequests.value.map(item => item.receiver_id)
      pendingIncomingUserIds.value = receivedFriendRequests.value.map(item => item.sender_id)

      updateSearchResultRequestFlags()
      friendRequestsLoadedOnce.value = true
    }
  } catch (e) {
    console.error('加载好友申请失败:', e)
  }
}

const updateSearchResultRequestFlags = () => {
  const outgoingSet = new Set(pendingOutgoingUserIds.value)
  const incomingSet = new Set(pendingIncomingUserIds.value)
  if (searchResults.value.length === 0) return
  searchResults.value = searchResults.value.map(user => {
    const updated = { ...user }
    if (outgoingSet.has(user.id)) {
      updated.requestStatus = 'pending'
    } else if (updated.requestStatus === 'pending') {
      updated.requestStatus = null
    }
    if (incomingSet.has(user.id)) {
      updated.incomingRequestStatus = 'pending'
    } else if (updated.incomingRequestStatus === 'pending') {
      updated.incomingRequestStatus = null
    }
    return updated
  })
}

const isOutgoingPendingRequest = (user) => {
  if (!user) return false
  return user.requestStatus === 'pending' || pendingOutgoingUserIds.value.includes(user.id)
}

const isIncomingPendingRequest = (user) => {
  if (!user) return false
  return user.incomingRequestStatus === 'pending' || pendingIncomingUserIds.value.includes(user.id)
}

const isProcessingRequest = (requestId) => processingRequestIds.value.includes(requestId)

// 格式化申请时间
const formatRequestTime = (timeStr) => {
  if (!timeStr) return '-'
  try {
    const date = new Date(timeStr)
    const now = new Date()
    const diff = now - date
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)
    
    if (seconds < 60) {
      return '刚刚'
    } else if (minutes < 60) {
      return `${minutes}分钟前`
    } else if (hours < 24) {
      return `${hours}小时前`
    } else if (days < 7) {
      return `${days}天前`
    } else {
      // 超过7天显示具体日期
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hour = String(date.getHours()).padStart(2, '0')
      const minute = String(date.getMinutes()).padStart(2, '0')
      if (year === now.getFullYear()) {
        return `${month}-${day} ${hour}:${minute}`
      } else {
        return `${year}-${month}-${day} ${hour}:${minute}`
      }
    }
  } catch (e) {
    return timeStr
  }
}

const selectChat = async (item) => {
  // 如果点击的是当前已打开的聊天，不重复处理
  if (currentRoom.value === item.room && currentChatInfo.value) {
    console.log('已经是当前聊天，跳过')
    return
  }
  
  // 切换到聊天视图
  rightPanelView.value = 'chat'
  // 清除好友和群聊的选中状态
  selectedFriendId.value = null
  selectedGroupId.value = null
  
  // 清空当前消息列表和已删除消息集合
  messages.value = []
  deletedMessageIds.value.clear()
  
  // 清空推荐回复
  clearSuggestedReplies()
  
  // 关闭现有WebSocket连接
  if (ws.value) {
    ws.value.close()
    ws.value = null
  }
  
  currentRoom.value = item.room
  // 使用 chat_type 字段，如果没有则根据是否有 group_id 判断
  const chatType = item.chat_type || (item.group_id ? 'group' : (item.type === 'ai_friend' ? 'ai_friend' : 'private'))
  
  // 判断是否是AI好友聊天
  isAIFriendChat.value = chatType === 'ai_friend'
  
  // 确保显示名称优先使用备注，然后是昵称，最后是用户名
  // 群聊时，优先使用备注，如果没有备注则使用群名称
  // AI好友时，使用预设的名称
  const displayName = chatType === 'group' 
    ? (item.remark || item.name || '群聊')
    : chatType === 'ai_friend'
    ? (item.name || 'AI好友')
    : (item.remark || item.name || item.username || '聊天')
  
  currentChatInfo.value = {
    ...item,
    name: displayName,
    type: chatType,
    user_id: item.user_id, // 保存 user_id 以便后续匹配
    chat_type: chatType,
    member_count: item.member_count || item.members_len || null, // 群聊成员数量
    remark: item.remark, // 保存备注字段
    friend_type: item.friend_type // AI好友类型
  }
  
  // 立即清除该聊天的未读计数（乐观更新，提升用户体验）
  const chatItem = chatList.value.find(c => c.room === item.room)
  if (chatItem && chatItem.unreadCount > 0) {
    chatItem.unreadCount = 0
  }
  
  // 如果是群聊，加载群成员列表和群聊信息（用于显示消息发送者名称和判断是否已解散）
  if (chatType === 'group' && item.group_id) {
    try {
      const data = await group.getInfo(item.group_id)
      if (data.code === 200 && data.data) {
        groupMembers.value = data.data.members || []
        // 更新群聊信息（包括 is_disbanded 状态）
        groupInfo.value = data.data
        // 调试：打印群成员数据
        console.log('selectChat - 群成员数据:', groupMembers.value.map(m => ({
          user_id: m.user_id,
          group_nickname: m.group_nickname,
          friend_remark: m.friend_remark,
          name: m.name,
          username: m.username
        })))
      }
    } catch (e) {
      console.error('加载群成员列表失败:', e)
      groupMembers.value = []
      groupInfo.value = {}
    }
  } else {
    // 清空群成员列表和群聊信息
    groupMembers.value = []
    groupInfo.value = {}
  }
  
  // 如果是AI好友，使用特殊的连接方式
  if (chatType === 'ai_friend') {
    await connectAIFriendWebSocket(item.room)
  } else {
    await connectWebSocket(item.room, props.user.id, chatType)
  }
  
  // 如果是群聊，标记@消息已读
  if (chatType === 'group' && item.last_message_id && (item.is_mentioned || item.is_mention_all) && !item.mention_read) {
    try {
      await messagesApi.markMentionRead(item.last_message_id)
      // 更新聊天列表中的@标记状态
      const chatItem = chatList.value.find(c => c.room === item.room)
      if (chatItem) {
        chatItem.is_mentioned = false
        chatItem.mention_read = true
        // 重新格式化最后一条消息（移除@标记和未读数标记，保留完整消息内容）
        if (chatItem.lastMessage) {
          let updatedMessage = chatItem.lastMessage
          
          // 移除开头的@标记（【有人@我】或【@所有人】）
          const mentionTag = chatItem.is_mention_all ? '【@所有人】' : '【有人@我】'
          if (updatedMessage.startsWith(mentionTag)) {
            updatedMessage = updatedMessage.substring(mentionTag.length)
          }
          
          // 移除未读数标记（【n条】），可能在@标记后面
          const unreadPattern = /^【\d+条】/
          if (unreadPattern.test(updatedMessage.trim())) {
            updatedMessage = updatedMessage.replace(unreadPattern, '').trim()
          }
          
          chatItem.lastMessage = updatedMessage.trim()
        }
      }
    } catch (e) {
      console.error('标记@消息已读失败:', e)
    }
  }
  
  // 如果是群聊，在WebSocket连接后更新已显示消息的发送者名称
  if (chatType === 'group' && groupMembers.value.length > 0) {
    // 等待消息加载完成后再更新
    setTimeout(() => {
      messages.value = messages.value.map(msg => {
        // 系统通知不更新昵称
        if (isSystemMessage(msg)) {
          return msg
        }
        if (msg.sender_id !== props.user.id) {
          const member = groupMembers.value.find(m => m.user_id === msg.sender_id)
          if (member) {
            const displayName = getMemberDisplayName(member)
            if (msg.nickname !== displayName) {
              return {
                ...msg,
                nickname: displayName
              }
            }
          }
        }
        return msg
      })
    }, 500)
  }
}

// 显示好友信息对话框
const showFriendInfo = async (friendItem) => {
  await showUserInfo(friendItem.user_id, friendItem.avatar, friendItem.name || friendItem.username)
}

// 在右侧面板显示好友信息（不打开弹窗）
const showFriendInfoInRightPanel = async (friendItem) => {
  selectedFriendId.value = friendItem.user_id
  selectedGroupId.value = null // 清除群聊选中状态
  rightPanelView.value = 'userInfo'
  await loadUserInfoForRightPanel(friendItem.user_id, friendItem.avatar, friendItem.name || friendItem.username)
}

// 从群成员在右侧面板显示用户信息（不打开弹窗）
const showUserInfoInRightPanelFromMember = async (member) => {
  rightPanelView.value = 'userInfo'
  await loadUserInfoForRightPanel(member.user_id, member.avatar, getMemberDisplayName(member))
}

// 在右侧面板显示推荐好友信息（不打开弹窗）
const showUserInfoInRightPanelFromRecommendation = async (recommendation) => {
  selectedFriendId.value = recommendation.user_id
  selectedGroupId.value = null // 清除群聊选中状态
  rightPanelView.value = 'userInfo'
  await loadUserInfoForRightPanel(recommendation.user_id, recommendation.avatar, recommendation.name || recommendation.username)
}

// 加载用户信息用于右侧面板显示（不打开弹窗）
const loadUserInfoForRightPanel = async (userId, avatar, nickname) => {
  try {
    selectedFriendRequest.value = null
    selectedFriendRequestIsIncoming.value = false
    // 先使用消息中的信息作为临时显示
    selectedUserInfo.value = {
      id: userId,
      username: '',
      name: nickname || '',
      avatar: avatar || '',
      remark: '',
      email: '',
      is_friend: false,
      is_blocked: 0,
      group_nickname: null
    }
    // 不设置 showUserInfoDialog.value = true，这样就不会打开弹窗
    
    // 如果是群聊，获取该用户在群中的群聊昵称
    let groupNickname = null
    if (currentChatInfo.value?.type === 'group' && groupMembers.value.length > 0) {
      const member = groupMembers.value.find(m => m.user_id === userId)
      if (member && member.group_nickname && member.group_nickname !== member.name) {
        groupNickname = member.group_nickname
      }
    }
    
    // 异步获取完整的用户信息（包括备注和邮箱）
    const data = await friend.getUserInfo(userId)
    if (data.code === 200 && data.data) {
      // 处理备注：如果备注为空字符串或等于用户名，则视为未设置备注
      const remark = data.data.remark && data.data.remark.trim() && data.data.remark !== data.data.username ? data.data.remark : ''
      selectedUserInfo.value = {
        id: data.data.id,
        username: data.data.username || '',
        name: data.data.name || data.data.username || '',
        avatar: data.data.avatar || '',
        email: data.data.email || '',
        remark: remark,
        signature: data.data.signature || '',
        interests: data.data.interests || '',
        is_friend: data.data.is_friend || false,
        is_blocked: data.data.is_blocked || 0,
        group_nickname: groupNickname,
        isAIFriend: false
      }
      // 处理interests字段：如果是JSON数组字符串，转换为逗号分隔字符串用于显示
      if (selectedUserInfo.value.interests && typeof selectedUserInfo.value.interests === 'string') {
        try {
          const parsed = JSON.parse(selectedUserInfo.value.interests)
          if (Array.isArray(parsed)) {
            selectedUserInfo.value.interests = parsed.join(',')
          }
        } catch (e) {
          // 不是JSON格式，保持原样（已经是逗号分隔字符串）
        }
      }
    } else {
      // 即使获取用户信息失败，也设置群聊昵称
      selectedUserInfo.value.group_nickname = groupNickname
    }
  } catch (e) {
    console.error('获取用户信息失败:', e)
    // 即使获取失败，也显示已有的信息
  }
}

// 在右侧面板显示群聊信息
const showGroupInfoInRightPanel = async (groupId) => {
  if (!groupId) return
  
  selectedGroupId.value = groupId
  selectedFriendId.value = null // 清除好友选中状态
  rightPanelView.value = 'groupInfo'
  groupMemberSearchKeyword.value = ''
  
  try {
    // 加载群聊信息
    const data = await group.getInfo(groupId)
    if (data.code === 200 && data.data) {
      groupInfo.value = data.data
      groupMembers.value = data.data.members || []
      // 加载群公告内容
      announcementContent.value = data.data.announcement || ''
      // 调试：打印群成员数据
      console.log('群成员数据:', groupMembers.value.map(m => ({
        user_id: m.user_id,
        group_nickname: m.group_nickname,
        friend_remark: m.friend_remark,
        name: m.name,
        username: m.username
      })))
      
      // 加载管理员列表
      try {
        const adminData = await group.getAdmins(groupId)
        if (adminData.code === 200) {
          groupAdmins.value = adminData.data || []
        }
      } catch (e) {
        console.error('加载管理员列表失败:', e)
        groupAdmins.value = []
      }
      
      filterGroupMembers()
      
      // 加载用户对群聊的备注和群昵称
      groupRemark.value = data.data.user_remark || ''
      myGroupNickname.value = data.data.user_nickname || ''
      
      // 更新已显示的消息中的发送者名称（如果是群聊且当前正在查看该群聊）
      if (currentChatInfo.value?.type === 'group' && currentChatInfo.value?.group_id === groupId) {
        messages.value = messages.value.map(msg => {
          // 系统通知不更新昵称
          if (isSystemMessage(msg)) {
            return msg
          }
          if (msg.sender_id !== props.user.id) {
            const member = groupMembers.value.find(m => m.user_id === msg.sender_id)
            if (member) {
              return {
                ...msg,
                nickname: getMemberDisplayName(member)
              }
            }
          }
          return msg
        })
      }
    } else {
      showToast('加载群聊信息失败', 'error')
      rightPanelView.value = 'chat'
    }
  } catch (e) {
    console.error('加载群聊信息失败:', e)
    showToast('加载群聊信息失败，请重试', 'error')
    rightPanelView.value = 'chat'
  }
}

const viewFriendRequestDetail = async (request) => {
  if (!request) return
  const displayName = request.sender?.name || request.sender?.username
  await showUserInfo(
    request.sender_id,
    request.sender?.avatar,
    displayName,
    { request, isIncoming: true }
  )
}

const viewSentFriendRequestDetail = async (request) => {
  if (!request) return
  const displayName = request.receiver?.name || request.receiver?.username
  await showUserInfo(
    request.receiver_id,
    request.receiver?.avatar,
    displayName,
    { request, isIncoming: false }
  )
}

const selectFriend = async (friendItem) => {
  if (friendItem.room) {
    currentRoom.value = friendItem.room
    // 优先使用备注，然后是昵称，最后是用户名
    currentChatInfo.value = {
      name: friendItem.remark || friendItem.name || friendItem.username,
      room: friendItem.room,
      type: 'private',
      user_id: friendItem.user_id,
      chat_type: 'private'
    }
    await connectWebSocket(friendItem.room, props.user.id, 'private')
  }
}
const connectWebSocket = async (room, id, type) => {
  // 如果已经连接到相同的房间，不重复连接
  if (ws.value && ws.value.readyState === WebSocket.OPEN && currentRoom.value === room) {
    console.log('WebSocket已经连接到该房间，跳过重复连接')
    return
  }
  
  // 关闭现有连接（切换聊天时必须关闭）
  if (ws.value) {
    console.log('关闭现有WebSocket连接，准备切换到新聊天')
    ws.value.close()
    ws.value = null
  }
  
  // 等待一小段时间确保连接已关闭
  await new Promise(resolve => setTimeout(resolve, 100))
  
  try {
    const wsUrl = await getWebSocketUrl()
    const fullUrl = `${wsUrl}/api/chat/v1/message/chat?room=${room}&id=${id}&type=${type}`
    console.log('正在连接WebSocket:', fullUrl)
    ws.value = new WebSocket(fullUrl)
    
    ws.value.onopen = () => {
      console.log('WebSocket连接成功')
      // 如果是群聊，连接成功后刷新聊天列表以清除未读计数
      if (type === 'group') {
        // 延迟一小段时间，确保后端已处理完已读标记
        setTimeout(() => {
          loadChatList()
        }, 300)
      }
    }
    
    ws.value.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data)
        if (Array.isArray(data)) {
          // 历史消息
          console.log('收到历史消息，总数:', data.length)
          messages.value = data.map(msg => {
            // 如果是系统通知，直接返回，确保不包含avatar和nickname字段
            // 检查 type 或 media_type 字段，确保系统通知被正确识别
            const isSystem = msg.type === 'system' || msg.media_type === 'system'
            if (isSystem) {
              console.log('历史消息中的系统通知:', {
                id: msg.id,
                type: msg.type,
                media_type: msg.media_type,
                content: msg.content,
                room: msg.room,
                sender_id: msg.sender_id,
                receiver_id: msg.receiver_id
              })
              
              // 根据当前用户对成员的备注动态生成系统通知内容
              let displayContent = msg.content
              try {
                const contentData = JSON.parse(msg.content)
                if (contentData.type === 'invite' && contentData.creator_id && contentData.invited_member_ids) {
                  // 处理创建群聊时邀请加入的系统通知
                  // 获取创建者的显示名称（对于当前用户）
                  let creatorDisplayName = '用户'
                  if (contentData.creator_id === props.user.id) {
                    // 如果是自己，显示"你"
                    creatorDisplayName = '你'
                  } else {
                    // 尝试从群成员列表中查找
                    const member = groupMembers.value.find(m => m.user_id === contentData.creator_id)
                    if (member) {
                      creatorDisplayName = getMemberDisplayName(member)
                    } else {
                      // 如果找不到群成员信息，尝试从好友列表中查找备注
                      const friend = allContacts.value.find(c => c.user_id === contentData.creator_id)
                      if (friend) {
                        creatorDisplayName = friend.remark || friend.displayName || friend.name || friend.username || '用户'
                      }
                    }
                  }
                  
                  // 获取被邀请成员的显示名称列表（对于当前用户）
                  const invitedMemberNames = []
                  for (const memberId of contentData.invited_member_ids) {
                    let memberDisplayName = '用户'
                    if (memberId === props.user.id) {
                      // 如果是自己，显示"你"
                      memberDisplayName = '你'
                    } else {
                      // 尝试从群成员列表中查找
                      const member = groupMembers.value.find(m => m.user_id === memberId)
                      if (member) {
                        memberDisplayName = getMemberDisplayName(member)
                      } else {
                        // 如果找不到群成员信息，尝试从好友列表中查找备注
                        const friend = allContacts.value.find(c => c.user_id === memberId)
                        if (friend) {
                          memberDisplayName = friend.remark || friend.displayName || friend.name || friend.username || '用户'
                        }
                      }
                    }
                    invitedMemberNames.push(memberDisplayName)
                  }
                  
                  // 添加时间戳
                  const timeStr = msg.created_at ? new Date(msg.created_at.replace(/\//g, '-')).toLocaleString('zh-CN', { 
                    year: 'numeric', 
                    month: '2-digit', 
                    day: '2-digit', 
                    hour: '2-digit', 
                    minute: '2-digit', 
                    second: '2-digit',
                    hour12: false 
                  }).replace(/\//g, '/') : ''
                  displayContent = `${creatorDisplayName}邀请${invitedMemberNames.join('、')}加入群聊${timeStr}`
                } else if (contentData.type === 'invite_member' && contentData.inviter_id && contentData.invited_user_id) {
                  // 处理添加群成员的系统通知
                  // 获取邀请者的显示名称（对于当前用户）
                  let inviterDisplayName = '用户'
                  if (contentData.inviter_id === props.user.id) {
                    // 如果邀请者是自己，显示"你"
                    inviterDisplayName = '你'
                  } else {
                    const inviterMember = groupMembers.value.find(m => m.user_id === contentData.inviter_id)
                    if (inviterMember) {
                      inviterDisplayName = getMemberDisplayName(inviterMember)
                    }
                  }
                  
                  // 获取被邀请者的显示名称（对于当前用户）
                  let invitedDisplayName = '用户'
                  if (contentData.invited_user_id === props.user.id) {
                    // 如果被邀请者是自己，显示"你"
                    invitedDisplayName = '你'
                  } else {
                    // 先尝试从群成员列表中查找
                    const invitedMember = groupMembers.value.find(m => m.user_id === contentData.invited_user_id)
                    if (invitedMember) {
                      invitedDisplayName = getMemberDisplayName(invitedMember)
                    } else {
                      // 如果找不到群成员信息（可能刚被邀请还没加入），尝试从好友列表中查找备注
                      const friend = allContacts.value.find(c => c.user_id === contentData.invited_user_id)
                      if (friend) {
                        invitedDisplayName = friend.remark || friend.displayName || friend.name || friend.username || '用户'
                      }
                    }
                  }
                  
                  // 添加时间戳
                  const timeStr = msg.created_at ? new Date(msg.created_at.replace(/\//g, '-')).toLocaleString('zh-CN', { 
                    year: 'numeric', 
                    month: '2-digit', 
                    day: '2-digit', 
                    hour: '2-digit', 
                    minute: '2-digit', 
                    second: '2-digit',
                    hour12: false 
                  }).replace(/\//g, '/') : ''
                  displayContent = `${inviterDisplayName}邀请了${invitedDisplayName}进入群聊`
                } else if (contentData.type === 'leave_group' && contentData.user_id) {
                  // 处理退出群聊的系统通知
                  if (contentData.user_id === props.user.id) {
                    // 如果退出者是自己，显示"你退出了群聊"
                    displayContent = '你退出了群聊'
                  } else {
                    // 获取退出者的显示名称（对于当前用户）
                    // 系统通知中包含了退出者的群聊昵称、个人昵称和用户名
                    let leaverDisplayName = '用户'
                    // 尝试从好友列表中查找备注
                    const friend = allContacts.value.find(c => c.user_id === contentData.user_id)
                    let friendRemark = null
                    if (friend) {
                      friendRemark = friend.remark
                    }
                    // 优先级：群聊昵称 > 好友备注 > 个人昵称 > 用户名
                    let groupNickname = contentData.group_nickname
                    if (groupNickname && groupNickname === contentData.name) {
                      groupNickname = null // 群聊昵称是默认值，忽略它
                    }
                    leaverDisplayName = groupNickname || friendRemark || contentData.name || contentData.username || '用户'
                    displayContent = `${leaverDisplayName}退出了群聊`
                  }
                } else if (contentData.type === 'transfer_ownership' && contentData.old_creator_id && contentData.new_creator_id) {
                  // 处理转让群主的系统通知
                  if (contentData.new_creator_id === props.user.id) {
                    // 如果新群主是自己，显示"你已成为新的群主"
                    displayContent = '你已成为新的群主'
                  } else {
                    // 获取新群主的显示名称（对于当前用户）
                    const member = groupMembers.value.find(m => m.user_id === contentData.new_creator_id)
                    if (member) {
                      const displayName = getMemberDisplayName(member)
                      displayContent = `${displayName}已成为新的群主`
                    } else {
                      // 如果找不到群成员信息，使用基本信息
                      displayContent = '用户已成为新的群主'
                    }
                  }
                } else if (contentData.type === 'add_admin' && contentData.operator_id && contentData.admin_user_id) {
                  // 处理添加管理员的系统通知
                  if (contentData.admin_user_id === props.user.id) {
                    // 如果被添加的管理员是自己，显示"已将你添加为群管理员"
                    displayContent = '已将你添加为群管理员'
                  } else {
                    // 获取被添加管理员的显示名称（对于当前用户）
                    const member = groupMembers.value.find(m => m.user_id === contentData.admin_user_id)
                    if (member) {
                      const displayName = getMemberDisplayName(member)
                      displayContent = `已将${displayName}添加为群管理员`
                    } else {
                      displayContent = '已将用户添加为群管理员'
                    }
                  }
                } else if (contentData.type === 'join_by_search' && contentData.user_id) {
                  // 处理通过搜索加入群聊的系统通知
                  if (contentData.user_id === props.user.id) {
                    // 如果加入者是自己，显示"你通过搜索加入了群聊"
                    displayContent = '你通过搜索加入了群聊'
                  } else {
                    // 获取加入者的显示名称（对于当前用户）
                    let joinerDisplayName = '用户'
                    // 先尝试从群成员列表中查找
                    const joinerMember = groupMembers.value.find(m => m.user_id === contentData.user_id)
                    if (joinerMember) {
                      joinerDisplayName = getMemberDisplayName(joinerMember)
                    } else {
                      // 如果找不到群成员信息，尝试从好友列表中查找备注
                      const friend = allContacts.value.find(c => c.user_id === contentData.user_id)
                      if (friend) {
                        joinerDisplayName = friend.remark || friend.displayName || friend.name || friend.username || '用户'
                      }
                    }
                    displayContent = `${joinerDisplayName}通过搜索加入了群聊`
                  }
                } else if (contentData.type === 'remove_admin' && contentData.operator_id && contentData.admin_user_id) {
                  // 处理移除管理员的系统通知
                  if (contentData.admin_user_id === props.user.id) {
                    // 如果被移除的管理员是自己，显示"已将你从群管理员中移除"
                    displayContent = '已将你从群管理员中移除'
                  } else {
                    // 获取被移除管理员的显示名称（对于当前用户）
                    const member = groupMembers.value.find(m => m.user_id === contentData.admin_user_id)
                    if (member) {
                      const displayName = getMemberDisplayName(member)
                      displayContent = `已将${displayName}从群管理员中移除`
                    } else {
                      displayContent = '已将用户从群管理员中移除'
                    }
                  }
                } else if (contentData.type === 'recall_member_message' && contentData.operator_id) {
                  // 处理撤回成员消息的系统通知
                  // 获取操作者的显示名称（对于当前用户）
                  let operatorDisplayName = '用户'
                  if (contentData.operator_id === props.user.id) {
                    // 如果操作者是自己，显示"你"
                    operatorDisplayName = '你'
                  } else {
                    // 尝试从群成员列表中查找
                    const operatorMember = groupMembers.value.find(m => m.user_id === contentData.operator_id)
                    if (operatorMember) {
                      operatorDisplayName = getMemberDisplayName(operatorMember)
                    } else {
                      // 如果找不到群成员信息，使用系统通知中的信息
                      const friend = allContacts.value.find(c => c.user_id === contentData.operator_id)
                      let friendRemark = null
                      if (friend) {
                        friendRemark = friend.remark
                      }
                      // 优先级：群聊昵称 > 好友备注 > 个人昵称 > 用户名
                      let groupNickname = contentData.operator_group_nickname
                      if (groupNickname && groupNickname === contentData.operator_name) {
                        groupNickname = null // 群聊昵称是默认值，忽略它
                      }
                      operatorDisplayName = groupNickname || friendRemark || contentData.operator_name || contentData.operator_username || '用户'
                    }
                  }
                  
                  displayContent = `${operatorDisplayName}撤回了一条成员消息`
                } else if (contentData.type === 'ai_friend_created' && contentData.message) {
                  // 处理AI好友创建成功的系统通知
                  displayContent = contentData.message
                } else if (contentData.type === 'ai_friend_type_changed' && contentData.friend_type_name) {
                  // 处理AI好友类型改变的系统通知
                  displayContent = `AI好友类型已切换为${contentData.friend_type_name}`
                } else if (contentData.type === 'ai_friend_context_cleared') {
                  // 处理AI好友上下文清空的系统通知
                  displayContent = 'AI好友上下文已清空'
                }
              } catch (e) {
                // 如果不是JSON格式，使用原始内容
                displayContent = msg.content
              }
              
              const systemMsg = {
                id: msg.id,
                sender_id: msg.sender_id,
                receiver_id: msg.receiver_id,
                content: displayContent,
                room: msg.room,
                type: 'system',
                media_type: msg.media_type || 'system',
                created_at: msg.created_at,
                is_recalled: 0,
                // 保留nickname和name字段，用于获取发送者显示名称
                nickname: msg.nickname,
                name: msg.name
              }
              console.log('处理后的系统通知对象:', systemMsg)
              return systemMsg
            }
            
            // 如果消息已撤回，需要重新生成撤回提示文本
            if (msg.is_recalled === 1) {
              const isOwnMessage = msg.sender_id === props.user.id
              let recallText = ''
              if (isOwnMessage) {
                recallText = '你撤回了一条消息'
              } else {
                // 获取发送者的显示名称
                let displayName = '用户'
                if (type === 'group') {
                  // 群聊：优先使用群聊昵称，然后是备注，然后是个人昵称，最后是用户名
                  const member = groupMembers.value.find(m => m.user_id === msg.sender_id)
                  if (member) {
                    displayName = getMemberDisplayName(member)
                  } else {
                    // 如果找不到群成员信息，使用消息中的nickname或name
                    displayName = msg.nickname || msg.name || '用户'
                  }
                } else {
                  // 私聊：优先使用备注，其次是昵称，最后是用户名
                  displayName = currentChatInfo.value?.name || '对方'
                }
                recallText = `${displayName}撤回了一条消息`
              }
              // 更新消息内容为撤回提示
              msg.content = recallText
            }
            
            let displayNickname = msg.nickname
            // 如果是群聊且不是自己发送的消息，使用群成员显示名称
            if (type === 'group' && msg.sender_id !== props.user.id) {
              const member = groupMembers.value.find(m => m.user_id === msg.sender_id)
              if (member) {
                displayNickname = getMemberDisplayName(member)
              } else {
                displayNickname = msg.nickname || '用户'
              }
            } else if (msg.sender_id === props.user.id) {
              displayNickname = props.user.name || props.user.username
            } else {
              displayNickname = msg.nickname || '用户'
            }
            // 处理转发消息：如果是forward_multiple类型，确保forward_info被正确设置
            let forwardInfo = null
            if (msg.media_type === 'forward_multiple') {
              // 如果后端已经发送了forward_info，直接使用
              if (msg.forward_info) {
                forwardInfo = msg.forward_info
              } else {
                // 否则从content中解析
                try {
                  forwardInfo = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content
                } catch (e) {
                  console.error('解析转发消息内容失败:', e)
                }
              }
            }
            
            const processedMsg = {
              ...msg,
              nickname: displayNickname,
              // 如果是自己发送的消息，使用当前用户的头像；否则使用消息中的头像
              avatar: msg.sender_id === props.user.id ? props.user.avatar : msg.avatar,
              // 保留requires_verification和is_blocked字段
              requires_verification: msg.requires_verification || 0,
              is_blocked: msg.is_blocked || 0
            }
            
            // 如果是转发消息，添加forward_info
            if (forwardInfo) {
              processedMsg.forward_info = forwardInfo
            }
            
            return processedMsg
          })
          console.log('处理后的消息列表，总数:', messages.value.length, '系统通知数量:', messages.value.filter(msg => msg.type === 'system' || msg.media_type === 'system').length)
          scrollToBottom()
          // 收到历史消息后，后端已经将未读消息标记为已读，立即刷新聊天列表以更新未读计数
          // 由于前端已经在点击时乐观更新了unreadCount，这里主要是为了同步后端数据
          loadChatList()
        } else if (data.type === 'recall') {
          // 撤回通知
          const messageId = data.message_id
          const recallSenderId = data.sender_id || null
          messages.value = messages.value.map(msg => {
            if (msg.id === messageId) {
              // 更新消息为已撤回状态，并更新内容为撤回提示
              const senderId = recallSenderId || msg.sender_id
              const isOwnMessage = senderId === props.user.id
              let recallText = ''
              if (isOwnMessage) {
                recallText = '你撤回了一条消息'
              } else {
                // 获取发送者的显示名称
                let displayName = '用户'
                if (currentChatInfo.value?.type === 'group') {
                  // 群聊：优先使用群聊昵称，然后是备注，然后是个人昵称，最后是用户名
                  const member = groupMembers.value.find(m => m.user_id === senderId)
                  if (member) {
                    displayName = getMemberDisplayName(member)
                  } else {
                    // 如果找不到群成员信息，使用消息中的nickname或name
                    displayName = msg.nickname || msg.name || '用户'
                  }
                } else {
                  // 私聊：优先使用备注，其次是昵称，最后是用户名
                  displayName = currentChatInfo.value?.name || '对方'
                }
                recallText = `${displayName}撤回了一条消息`
              }
              return { ...msg, is_recalled: 1, content: recallText }
            }
            return msg
          })
          // 刷新聊天列表
          setTimeout(() => {
            loadChatList()
          }, 300)
        } else if (data.type === 'system' || data.media_type === 'system') {
          // 系统通知消息（使用后端返回的ID，如果没有则生成临时ID）
          // 确保系统通知对象只包含必要字段，不包含avatar和nickname
          console.log('WebSocket接收到的系统通知:', data)
          
          // 根据当前用户对成员的备注动态生成系统通知内容
          let displayContent = data.content
          try {
            const contentData = JSON.parse(data.content)
            if (contentData.type === 'invite' && contentData.creator_id && contentData.invited_member_ids) {
              // 处理创建群聊时邀请加入的系统通知
              // 获取创建者的显示名称（对于当前用户）
              let creatorDisplayName = '用户'
              if (contentData.creator_id === props.user.id) {
                // 如果是自己，显示"你"
                creatorDisplayName = '你'
              } else {
                // 尝试从群成员列表中查找
                const member = groupMembers.value.find(m => m.user_id === contentData.creator_id)
                if (member) {
                  creatorDisplayName = getMemberDisplayName(member)
                } else {
                  // 如果找不到群成员信息，尝试从好友列表中查找备注
                  const friend = allContacts.value.find(c => c.user_id === contentData.creator_id)
                  if (friend) {
                    creatorDisplayName = friend.remark || friend.displayName || friend.name || friend.username || '用户'
                  }
                }
              }
              
              // 获取被邀请成员的显示名称列表（对于当前用户）
              const invitedMemberNames = []
              for (const memberId of contentData.invited_member_ids) {
                let memberDisplayName = '用户'
                if (memberId === props.user.id) {
                  // 如果是自己，显示"你"
                  memberDisplayName = '你'
                } else {
                  // 尝试从群成员列表中查找
                  const member = groupMembers.value.find(m => m.user_id === memberId)
                  if (member) {
                    memberDisplayName = getMemberDisplayName(member)
                  } else {
                    // 如果找不到群成员信息，尝试从好友列表中查找备注
                    const friend = allContacts.value.find(c => c.user_id === memberId)
                    if (friend) {
                      memberDisplayName = friend.remark || friend.displayName || friend.name || friend.username || '用户'
                    }
                  }
                }
                invitedMemberNames.push(memberDisplayName)
              }
              
              // 添加时间戳
              const timeStr = data.created_at ? new Date(data.created_at.replace(/\//g, '-')).toLocaleString('zh-CN', { 
                year: 'numeric', 
                month: '2-digit', 
                day: '2-digit', 
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit',
                hour12: false 
              }).replace(/\//g, '/') : new Date().toLocaleString('zh-CN', { 
                year: 'numeric', 
                month: '2-digit', 
                day: '2-digit', 
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit',
                hour12: false 
              }).replace(/\//g, '/')
              displayContent = `${creatorDisplayName}邀请${invitedMemberNames.join('、')}加入群聊${timeStr}`
            } else if (contentData.type === 'invite_member' && contentData.inviter_id && contentData.invited_user_id) {
              // 处理添加群成员的系统通知
              // 获取邀请者的显示名称（对于当前用户）
              let inviterDisplayName = '用户'
              if (contentData.inviter_id === props.user.id) {
                // 如果邀请者是自己，显示"你"
                inviterDisplayName = '你'
              } else {
                const inviterMember = groupMembers.value.find(m => m.user_id === contentData.inviter_id)
                if (inviterMember) {
                  inviterDisplayName = getMemberDisplayName(inviterMember)
                }
              }
              
              // 获取被邀请者的显示名称（对于当前用户）
              let invitedDisplayName = '用户'
              if (contentData.invited_user_id === props.user.id) {
                // 如果被邀请者是自己，显示"你"
                invitedDisplayName = '你'
              } else {
                // 先尝试从群成员列表中查找
                const invitedMember = groupMembers.value.find(m => m.user_id === contentData.invited_user_id)
                if (invitedMember) {
                  invitedDisplayName = getMemberDisplayName(invitedMember)
                } else {
                  // 如果找不到群成员信息（可能刚被邀请还没加入），尝试从好友列表中查找备注
                  const friend = allContacts.value.find(c => c.user_id === contentData.invited_user_id)
                  if (friend) {
                    invitedDisplayName = friend.remark || friend.displayName || friend.name || friend.username || '用户'
                  }
                }
              }
              
              // 添加时间戳
              const timeStr = data.created_at ? new Date(data.created_at.replace(/\//g, '-')).toLocaleString('zh-CN', { 
                year: 'numeric', 
                month: '2-digit', 
                day: '2-digit', 
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit',
                hour12: false 
              }).replace(/\//g, '/') : new Date().toLocaleString('zh-CN', { 
                year: 'numeric', 
                month: '2-digit', 
                day: '2-digit', 
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit',
                hour12: false 
              }).replace(/\//g, '/')
              displayContent = `${inviterDisplayName}邀请了${invitedDisplayName}进入群聊`
            } else if (contentData.type === 'leave_group' && contentData.user_id) {
              // 处理退出群聊的系统通知
              if (contentData.user_id === props.user.id) {
                // 如果退出者是自己，显示"你退出了群聊"
                displayContent = '你退出了群聊'
              } else {
                // 获取退出者的显示名称（对于当前用户）
                // 系统通知中包含了退出者的群聊昵称、个人昵称和用户名
                let leaverDisplayName = '用户'
                // 尝试从好友列表中查找备注
                const friend = allContacts.value.find(c => c.user_id === contentData.user_id)
                let friendRemark = null
                if (friend) {
                  friendRemark = friend.remark
                }
                // 优先级：群聊昵称 > 好友备注 > 个人昵称 > 用户名
                let groupNickname = contentData.group_nickname
                if (groupNickname && groupNickname === contentData.name) {
                  groupNickname = null // 群聊昵称是默认值，忽略它
                }
                leaverDisplayName = groupNickname || friendRemark || contentData.name || contentData.username || '用户'
                displayContent = `${leaverDisplayName}退出了群聊`
              }
            } else if (contentData.type === 'transfer_ownership' && contentData.old_creator_id && contentData.new_creator_id) {
              // 处理转让群主的系统通知
              if (contentData.new_creator_id === props.user.id) {
                // 如果新群主是自己，显示"你已成为新的群主"
                displayContent = '你已成为新的群主'
              } else {
                // 获取新群主的显示名称（对于当前用户）
                const member = groupMembers.value.find(m => m.user_id === contentData.new_creator_id)
                if (member) {
                  const displayName = getMemberDisplayName(member)
                  displayContent = `${displayName}已成为新的群主`
                } else {
                  // 如果找不到群成员信息，使用基本信息
                  displayContent = '用户已成为新的群主'
                }
              }
            } else if (contentData.type === 'join_by_search' && contentData.user_id) {
              // 处理通过搜索加入群聊的系统通知
              if (contentData.user_id === props.user.id) {
                // 如果加入者是自己，显示"你通过搜索加入了群聊"
                displayContent = '你通过搜索加入了群聊'
              } else {
                // 获取加入者的显示名称（对于当前用户）
                let joinerDisplayName = '用户'
                // 先尝试从群成员列表中查找
                const joinerMember = groupMembers.value.find(m => m.user_id === contentData.user_id)
                if (joinerMember) {
                  joinerDisplayName = getMemberDisplayName(joinerMember)
                } else {
                  // 如果找不到群成员信息，尝试从好友列表中查找备注
                  const friend = allContacts.value.find(c => c.user_id === contentData.user_id)
                  if (friend) {
                    joinerDisplayName = friend.remark || friend.displayName || friend.name || friend.username || '用户'
                  }
                }
                displayContent = `${joinerDisplayName}通过搜索加入了群聊`
              }
            } else if (contentData.type === 'add_admin' && contentData.operator_id && contentData.admin_user_id) {
              // 处理添加管理员的系统通知
              if (contentData.admin_user_id === props.user.id) {
                // 如果被添加的管理员是自己，显示"已将你添加为群管理员"
                displayContent = '已将你添加为群管理员'
              } else {
                // 获取被添加管理员的显示名称（对于当前用户）
                const member = groupMembers.value.find(m => m.user_id === contentData.admin_user_id)
                if (member) {
                  displayContent = `已将${getMemberDisplayName(member)}添加为群管理员`
                } else {
                  displayContent = '已将用户添加为群管理员'
                }
              }
            } else if (contentData.type === 'remove_admin' && contentData.operator_id && contentData.admin_user_id) {
              // 处理移除管理员的系统通知
              if (contentData.admin_user_id === props.user.id) {
                // 如果被移除的管理员是自己，显示"已将你从群管理员中移除"
                displayContent = '已将你从群管理员中移除'
              } else {
                // 获取被移除管理员的显示名称（对于当前用户）
                const member = groupMembers.value.find(m => m.user_id === contentData.admin_user_id)
                if (member) {
                  displayContent = `已将${getMemberDisplayName(member)}从群管理员中移除`
                } else {
                  displayContent = '已将用户从群管理员中移除'
                }
              }
            } else if (contentData.type === 'remove_member' && contentData.operator_id && contentData.removed_user_id) {
              // 处理移除成员的系统通知
              // 获取操作者的显示名称（对于当前用户）
              let operatorDisplayName = '用户'
              if (contentData.operator_id === props.user.id) {
                // 如果操作者是自己，显示"你"
                operatorDisplayName = '你'
              } else {
                // 尝试从群成员列表中查找
                const operatorMember = groupMembers.value.find(m => m.user_id === contentData.operator_id)
                if (operatorMember) {
                  operatorDisplayName = getMemberDisplayName(operatorMember)
                } else {
                  // 如果找不到群成员信息，使用系统通知中的信息
                  const friend = allContacts.value.find(c => c.user_id === contentData.operator_id)
                  let friendRemark = null
                  if (friend) {
                    friendRemark = friend.remark
                  }
                  // 优先级：群聊昵称 > 好友备注 > 个人昵称 > 用户名
                  let groupNickname = contentData.operator_group_nickname
                  if (groupNickname && groupNickname === contentData.operator_name) {
                    groupNickname = null // 群聊昵称是默认值，忽略它
                  }
                  operatorDisplayName = groupNickname || friendRemark || contentData.operator_name || contentData.operator_username || '用户'
                }
              }
              
              // 获取被移除成员的显示名称（对于当前用户）
              let removedDisplayName = '用户'
              if (contentData.removed_user_id === props.user.id) {
                // 如果被移除的成员是自己，显示"你"
                removedDisplayName = '你'
              } else {
                // 尝试从群成员列表中查找（可能已经被移除了，所以可能找不到）
                const removedMember = groupMembers.value.find(m => m.user_id === contentData.removed_user_id)
                if (removedMember) {
                  removedDisplayName = getMemberDisplayName(removedMember)
                } else {
                  // 如果找不到群成员信息，使用系统通知中的信息
                  const friend = allContacts.value.find(c => c.user_id === contentData.removed_user_id)
                  let friendRemark = null
                  if (friend) {
                    friendRemark = friend.remark
                  }
                  // 优先级：群聊昵称 > 好友备注 > 个人昵称 > 用户名
                  let groupNickname = contentData.removed_group_nickname
                  if (groupNickname && groupNickname === contentData.removed_name) {
                    groupNickname = null // 群聊昵称是默认值，忽略它
                  }
                  removedDisplayName = groupNickname || friendRemark || contentData.removed_name || contentData.removed_username || '用户'
                }
              }
              
              displayContent = `${operatorDisplayName}将${removedDisplayName}移出了群聊`
              
              // 如果被移除的成员是自己，关闭当前聊天并刷新列表
              if (contentData.removed_user_id === props.user.id) {
                // 如果当前正在查看被移除的群聊，关闭它
                if (currentChatInfo.value?.type === 'group' && currentChatInfo.value?.group_id === data.receiver_id) {
                  // 关闭WebSocket连接
                  if (ws.value) {
                    ws.value.close()
                    ws.value = null
                  }
                  // 清空当前聊天信息
                  currentChatInfo.value = null
                  currentRoom.value = null
                  messages.value = []
                  groupMembers.value = []
                  groupInfo.value = {}
                }
                // 刷新聊天列表（被移除的群聊会从列表中移除）
                loadChatList().then(() => {
                  // 刷新通讯录选项卡下的群聊列表（被移除的群聊会从列表中移除）
                  loadGroupChatListForContact()
                })
              }
            } else if (contentData.type === 'disband_group' && contentData.creator_id) {
              // 处理解散群聊的系统通知
              if (contentData.creator_id === props.user.id) {
                // 如果解散者是自己，显示"你已解散该群聊"
                displayContent = '你已解散该群聊'
              } else {
                // 获取解散者的显示名称（对于当前用户）
                // 优先级：群聊昵称 > 好友备注 > 个人昵称 > 用户名
                let creatorDisplayName = '用户'
                // 尝试从群成员列表中查找
                const member = groupMembers.value.find(m => m.user_id === contentData.creator_id)
                if (member) {
                  creatorDisplayName = getMemberDisplayName(member)
                } else {
                  // 如果找不到群成员信息，使用系统通知中的信息
                  // 尝试从好友列表中查找备注
                  const friend = allContacts.value.find(c => c.user_id === contentData.creator_id)
                  let friendRemark = null
                  if (friend) {
                    friendRemark = friend.remark
                  }
                  // 优先级：群聊昵称 > 好友备注 > 个人昵称 > 用户名
                  let groupNickname = contentData.group_nickname
                  if (groupNickname && groupNickname === contentData.name) {
                    groupNickname = null // 群聊昵称是默认值，忽略它
                  }
                  creatorDisplayName = groupNickname || friendRemark || contentData.name || contentData.username || '用户'
                }
                displayContent = `${creatorDisplayName}已解散该群聊`
              }
              // 更新群聊信息，标记为已解散
              // 如果当前正在查看该群聊，确保 groupInfo 已加载
              if (currentChatInfo.value?.type === 'group' && currentChatInfo.value?.group_id === data.receiver_id) {
                if (!groupInfo.value || Object.keys(groupInfo.value).length === 0) {
                  // 如果 groupInfo 未加载，加载群聊信息（异步处理，不阻塞消息显示）
                  group.getInfo(data.receiver_id).then(groupData => {
                    if (groupData.code === 200 && groupData.data) {
                      groupInfo.value = groupData.data
                    }
                  }).catch(e => {
                    console.error('加载群聊信息失败:', e)
                  })
                } else {
                  groupInfo.value.is_disbanded = 1
                }
              }
              // 刷新通讯录选项卡下的群聊列表（已解散的群聊会被移除）
              loadGroupChatListForContact()
            } else if (contentData.type === 'ai_friend_created' && contentData.message) {
              // 处理AI好友创建成功的系统通知
              displayContent = contentData.message
            } else if (contentData.type === 'ai_friend_type_changed' && contentData.friend_type_name) {
              // 处理AI好友类型改变的系统通知
              displayContent = `AI好友类型已切换为${contentData.friend_type_name}`
            } else if (contentData.type === 'ai_friend_context_cleared') {
              // 处理AI好友上下文清空的系统通知
              displayContent = 'AI好友上下文已清空'
            }
          } catch (e) {
            // 如果不是JSON格式，使用原始内容
            displayContent = data.content
          }
          
          const systemMsg = {
            id: data.id || `system_${Date.now()}_${Math.random()}`,
            sender_id: data.sender_id,
            receiver_id: data.receiver_id,
            content: displayContent,
            room: data.room,
            type: 'system',
            created_at: data.created_at || new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
            is_recalled: 0,
            // 保留nickname和name字段，用于获取发送者显示名称
            nickname: data.nickname,
            name: data.name
          }
          // 确保不包含avatar字段
          if (systemMsg.avatar !== undefined) delete systemMsg.avatar
          console.log('处理后的系统通知对象:', systemMsg)
          messages.value.push(systemMsg)
          scrollToBottom()
          // 刷新聊天列表以更新未读计数
          setTimeout(() => {
            loadChatList()
          }, 300)
        } else {
          // 新消息
          let displayNickname = data.nickname
          // 如果是群聊且不是自己发送的消息，使用群成员显示名称
          if (type === 'group' && data.sender_id !== props.user.id) {
            const member = groupMembers.value.find(m => m.user_id === data.sender_id)
            if (member) {
              displayNickname = getMemberDisplayName(member)
            } else {
              displayNickname = data.nickname || '用户'
            }
          } else if (data.sender_id === props.user.id) {
            displayNickname = props.user.name || props.user.username
          } else {
            displayNickname = data.nickname || '用户'
          }
          
          // 检查是否是群公告消息，如果是，从后端重新获取群公告内容以确保换行符正确
          let messageContent = data.content
          const isAnnouncement = type === 'group' && data.content && String(data.content).startsWith('群公告')
          
          if (isAnnouncement) {
            // 这是群公告消息，从后端重新获取群公告内容
            console.log('WebSocket接收到群公告消息，原始content:', JSON.stringify(data.content))
            try {
              const groupId = data.receiver_id
              if (groupId) {
                const groupData = await group.getInfo(groupId)
                console.log('从后端获取的群公告内容:', JSON.stringify(groupData.data?.announcement))
                if (groupData.code === 200 && groupData.data && groupData.data.announcement) {
                  // 使用后端返回的公告内容，确保换行符正确
                  // 统一处理换行符：将 \r\n 转换为 \n，确保换行符格式一致
                  const announcementText = String(groupData.data.announcement || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
                  messageContent = '群公告\n' + announcementText
                  console.log('处理后的群公告消息内容:', JSON.stringify(messageContent))
                }
              }
            } catch (e) {
              console.error('获取群公告内容失败:', e)
              // 如果获取失败，统一处理原始内容的换行符
              messageContent = String(data.content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
            }
          } else {
            // 对于非群公告消息，也统一处理换行符格式
            messageContent = String(data.content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
          }
          
          // 处理转发消息：如果是forward_multiple类型，确保forward_info被正确设置
          let forwardInfo = null
          if (data.media_type === 'forward_multiple') {
            // 如果后端已经发送了forward_info，直接使用
            if (data.forward_info) {
              forwardInfo = data.forward_info
            } else {
              // 否则从content中解析
              try {
                forwardInfo = typeof data.content === 'string' ? JSON.parse(data.content) : data.content
              } catch (e) {
                console.error('解析转发消息内容失败:', e)
              }
            }
          }
          
          // 检查消息是否已存在（可能手动添加消息的逻辑先执行了）
          const existingMsgIndex = messages.value.findIndex(msg => msg.id === data.id)
          if (existingMsgIndex !== -1) {
            // 消息已存在，更新消息内容（确保换行符正确）
            console.log('WebSocket: 消息已存在，更新消息内容。更新前content:', JSON.stringify(messages.value[existingMsgIndex].content))
            // 使用Vue的响应式更新方式，确保视图更新
            const updatedMsg = {
              ...messages.value[existingMsgIndex],
              content: messageContent,
              nickname: displayNickname,
              avatar: data.sender_id === props.user.id ? props.user.avatar : data.avatar
            }
            // 如果是转发消息，添加forward_info
            if (forwardInfo) {
              updatedMsg.forward_info = forwardInfo
            }
            messages.value[existingMsgIndex] = updatedMsg
            console.log('WebSocket: 更新后content:', JSON.stringify(messages.value[existingMsgIndex].content))
            // 强制触发Vue的响应式更新
            messages.value = [...messages.value]
            scrollToBottom()
          } else {
            // 消息不存在，添加新消息
            console.log('WebSocket: 消息不存在，添加新消息。content:', JSON.stringify(messageContent))
            const newMsg = {
              ...data,
              content: messageContent,
              nickname: displayNickname,
              // 如果是自己发送的消息，使用当前用户的头像；否则使用消息中的头像
              avatar: data.sender_id === props.user.id ? props.user.avatar : data.avatar
            }
            // 如果是转发消息，添加forward_info
            if (forwardInfo) {
              newMsg.forward_info = forwardInfo
            }
            // 确保保留 is_blocked 和 requires_verification 字段
            const msgWithBlocked = {
              ...newMsg,
              is_blocked: newMsg.is_blocked || 0,
              requires_verification: newMsg.requires_verification || 0
            }
            messages.value.push(msgWithBlocked)
            scrollToBottom()
            
            // 如果是对方发送的文本消息，生成推荐回复
            // 检查条件：1. 不是自己发送的 2. 是文本消息 3. 有内容 4. 不是重复消息
            const isTextMessage = (data.type === 'text' || data.media_type === 'text' || (!data.type && !data.media_type))
            const isFromOther = data.sender_id !== props.user.id
            const hasContent = messageContent && messageContent.trim()
            const isNotDuplicate = data.id !== lastMessageForSuggestion.value
            
            console.log('检查是否生成推荐回复:', {
              isTextMessage,
              isFromOther,
              hasContent: !!hasContent,
              isNotDuplicate,
              messageId: data.id,
              type: data.type,
              media_type: data.media_type,
              sender_id: data.sender_id,
              user_id: props.user.id
            })
            
            if (isFromOther && isTextMessage && hasContent && isNotDuplicate) {
              console.log('满足条件，生成推荐回复，消息内容:', messageContent)
              generateSuggestedReply(messageContent)
              lastMessageForSuggestion.value = data.id
            }
            
            // 如果是群聊消息，且当前已打开该群聊，立即清除未读计数
            if (type === 'group' && currentRoom.value === data.room && currentChatInfo.value && currentChatInfo.value.chat_type === 'group') {
              const chatItem = chatList.value.find(c => c.room === data.room)
              if (chatItem && chatItem.unreadCount > 0) {
                chatItem.unreadCount = 0
              }
            }
          }
          // 延迟刷新聊天列表，避免频繁更新
          // 如果是群聊消息，且当前已打开该群聊，立即刷新以确保未读计数被清除
          const isCurrentGroupChat = type === 'group' && currentRoom.value === data.room && currentChatInfo.value && currentChatInfo.value.chat_type === 'group'
          setTimeout(() => {
            loadChatList()
          }, isCurrentGroupChat ? 100 : 500)
        }
      } catch (e) {
        console.error('解析消息失败:', e)
      }
    }
    
    ws.value.onerror = (error) => {
      console.error('WebSocket错误:', error)
    }
    
    ws.value.onclose = () => {
      console.log('WebSocket连接关闭')
    }
  } catch (e) {
    console.error('WebSocket连接失败:', e)
  }
}

const getWebSocketUrl = async () => {
  // 使用与API请求相同的地址
  await initApiUrl()
  const apiUrl = getApiBaseUrl() || 'http://localhost:3000'
  console.log('WebSocket连接地址:', apiUrl.replace('http://', 'ws://').replace('https://', 'wss://'))
  return apiUrl.replace('http://', 'ws://').replace('https://', 'wss://')
}

const sendMessage = () => {
  if (!inputMessage.value.trim()) {
    console.warn('消息内容为空')
    return
  }
  
  // 检查群聊是否已解散
  if (isGroupDisbanded.value) {
    showToast('无法在已解散的群聊中发送消息', 'error')
    return
  }
  
  // 如果是AI好友聊天，使用特殊的发送方式
  if (isAIFriendChat.value) {
    sendAIFriendMessage()
    return
  }
  
  if (!ws.value) {
    console.error('WebSocket未连接')
    return
  }
  
  if (ws.value.readyState !== WebSocket.OPEN) {
    console.error('WebSocket未打开，当前状态:', ws.value.readyState)
    console.error('WebSocket状态说明:', {
      0: 'CONNECTING',
      1: 'OPEN',
      2: 'CLOSING',
      3: 'CLOSED'
    }[ws.value.readyState])
    return
  }
  
  // 对于群聊，receiver_id应该是群ID；对于私聊，receiver_id是对方用户ID
  const receiverId = currentChatInfo.value.type === 'group' 
    ? (currentChatInfo.value.group_id || currentChatInfo.value.id)
    : (currentChatInfo.value.user_id || props.user.id)
  
  const message = {
    sender_id: props.user.id,
    receiver_id: receiverId,
    type: 'text',
    content: inputMessage.value.trim()
  }
  
  console.log('发送消息:', message)
  try {
    ws.value.send(JSON.stringify(message))
    console.log('消息已发送')
    inputMessage.value = ''
    // 清空推荐回复
    suggestedReplies.value = []
    // 重置 textarea 高度
    if (messageInputRef.value) {
      messageInputRef.value.style.height = 'auto'
    }
  } catch (e) {
    console.error('发送消息失败:', e)
  }
}

// 连接AI好友WebSocket
const connectAIFriendWebSocket = async (room) => {
  // 关闭现有连接
  if (aiFriendWs.value) {
    aiFriendWs.value.close()
    aiFriendWs.value = null
  }
  
  // 等待一小段时间确保连接已关闭
  await new Promise(resolve => setTimeout(resolve, 100))
  
  try {
    // 加载历史消息
    const historyData = await aiFriend.getHistory(room, 50, 0)
    if (historyData.code === 200 && historyData.data) {
      messages.value = historyData.data.map(msg => {
        // 如果是系统通知，需要解析内容
        if (msg.type === 'system' || msg.media_type === 'system') {
          let displayContent = msg.content
          try {
            const contentData = JSON.parse(msg.content)
            if (contentData.type === 'ai_friend_created' && contentData.message) {
              // 处理AI好友创建成功的系统通知
              displayContent = contentData.message
            } else if (contentData.type === 'ai_friend_type_changed' && contentData.friend_type_name) {
              // 处理AI好友类型改变的系统通知
              displayContent = `AI好友类型已切换为${contentData.friend_type_name}`
            } else if (contentData.type === 'ai_friend_context_cleared') {
              // 处理AI好友上下文清空的系统通知
              displayContent = 'AI好友上下文已清空'
            }
          } catch (e) {
            // 如果不是JSON格式，使用原始内容
            displayContent = msg.content
          }
          return {
            ...msg,
            content: displayContent,
            type: 'system',
            media_type: 'system'
          }
        }
        return {
        ...msg,
        nickname: msg.sender_id === 0 ? 'AI好友' : (msg.nickname || '我')
        }
      })
      // 滚动到底部
      await nextTick()
      scrollToBottom()
    }
    
    // 连接WebSocket
    const wsUrl = await getWebSocketUrl()
    const token = localStorage.getItem('token') || ''
    const fullUrl = `${wsUrl}/api/chat/v1/ai-friend/chat-stream?token=${encodeURIComponent(token)}`
    console.log('正在连接AI好友WebSocket:', fullUrl)
    
    aiFriendWs.value = new WebSocket(fullUrl)
    
    aiFriendWs.value.onopen = () => {
      console.log('AI好友WebSocket连接成功')
    }
    
    aiFriendWs.value.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.error) {
          console.error('AI好友消息错误:', data.error)
          showToast(data.error, 'error')
        } else if (data.type === 'chunk') {
          // 流式接收AI回复
          const lastMsg = messages.value[messages.value.length - 1]
          if (lastMsg && lastMsg.sender_id === 0 && !lastMsg.finished) {
            // 追加到现有消息
            lastMsg.content += data.content
          } else {
            // 创建新消息
            messages.value.push({
              id: Date.now(), // 临时ID
              sender_id: 0,
              receiver_id: props.user.id,
              content: data.content,
              room: room,
              type: 'ai_friend',
              media_type: 'text',
              nickname: 'AI好友',
              finished: false,
              created_at: new Date().toISOString()
            })
          }
          scrollToBottom()
        } else if (data.type === 'done') {
          // 完成，等待一小段时间确保数据库已保存，然后重新加载历史消息
          setTimeout(async () => {
            try {
              const historyData = await aiFriend.getHistory(room, 50, 0)
              if (historyData.code === 200 && historyData.data) {
                // 替换所有消息为从数据库加载的真实消息
                messages.value = historyData.data.map(msg => {
                  // 如果是系统通知，需要解析内容
                  if (msg.type === 'system' || msg.media_type === 'system') {
                    let displayContent = msg.content
                    try {
                      const contentData = JSON.parse(msg.content)
                      if (contentData.type === 'ai_friend_created' && contentData.message) {
                        // 处理AI好友创建成功的系统通知
                        displayContent = contentData.message
                      } else if (contentData.type === 'ai_friend_type_changed' && contentData.friend_type_name) {
                        // 处理AI好友类型改变的系统通知
                        displayContent = `AI好友类型已切换为${contentData.friend_type_name}`
                      } else if (contentData.type === 'ai_friend_context_cleared') {
                        // 处理AI好友上下文清空的系统通知
                        displayContent = 'AI好友上下文已清空'
                      }
                    } catch (e) {
                      // 如果不是JSON格式，使用原始内容
                      displayContent = msg.content
                    }
                    return {
                      ...msg,
                      content: displayContent,
                      type: 'system',
                      media_type: 'system'
                    }
                  }
                  return {
                  ...msg,
                  nickname: msg.sender_id === 0 ? 'AI好友' : (msg.nickname || '我')
                  }
                })
                // 滚动到底部
                await nextTick()
                scrollToBottom()
              }
            } catch (e) {
              console.error('重新加载AI好友历史消息失败:', e)
            }
          }, 300) // 等待300ms确保数据库已保存
          // 刷新聊天列表
          loadChatList()
        }
      } catch (e) {
        console.error('解析AI好友消息失败:', e)
      }
    }
    
    aiFriendWs.value.onerror = (error) => {
      console.error('AI好友WebSocket错误:', error)
    }
    
    aiFriendWs.value.onclose = () => {
      console.log('AI好友WebSocket连接关闭')
    }
  } catch (e) {
    console.error('连接AI好友WebSocket失败:', e)
    showToast('连接AI好友失败', 'error')
  }
}

// 发送消息给AI好友
// 加载AI好友历史消息
const loadAIFriendHistory = async () => {
  if (!currentRoom.value) {
    return
  }
  try {
    const historyData = await aiFriend.getHistory(currentRoom.value, 50, 0)
    if (historyData.code === 200 && historyData.data) {
      messages.value = historyData.data.map(msg => {
        // 如果是系统通知，需要解析内容
        if (msg.type === 'system' || msg.media_type === 'system') {
          let displayContent = msg.content
          try {
            const contentData = JSON.parse(msg.content)
            if (contentData.type === 'ai_friend_created' && contentData.message) {
              // 处理AI好友创建成功的系统通知
              displayContent = contentData.message
            } else if (contentData.type === 'ai_friend_type_changed' && contentData.friend_type_name) {
              // 处理AI好友类型改变的系统通知
              displayContent = `AI好友类型已切换为${contentData.friend_type_name}`
            } else if (contentData.type === 'ai_friend_context_cleared') {
              // 处理AI好友上下文清空的系统通知
              displayContent = 'AI好友上下文已清空'
            }
          } catch (e) {
            // 如果不是JSON格式，使用原始内容
            displayContent = msg.content
          }
          return {
            ...msg,
            content: displayContent,
            type: 'system',
            media_type: 'system'
          }
        }
        return {
        ...msg,
        nickname: msg.sender_id === 0 ? 'AI好友' : (msg.nickname || '我')
        }
      })
      // 滚动到底部
      await nextTick()
      scrollToBottom()
    }
  } catch (e) {
    console.error('加载AI好友历史消息失败:', e)
  }
}

const sendAIFriendMessage = () => {
  if (!aiFriendWs.value || aiFriendWs.value.readyState !== WebSocket.OPEN) {
    showToast('AI好友连接未就绪', 'error')
    return
  }
  
  const content = inputMessage.value.trim()
  if (!content) {
    return
  }
  
  // 添加用户消息到界面（乐观更新）
  const userMessage = {
    id: Date.now(), // 临时ID
    sender_id: props.user.id,
    receiver_id: 0,
    content: content,
    room: currentRoom.value,
    type: 'ai_friend',
    media_type: 'text',
    nickname: props.user.name || props.user.username || '我',
    created_at: new Date().toISOString()
  }
  messages.value.push(userMessage)
  scrollToBottom()
  
  // 发送消息
  try {
    aiFriendWs.value.send(JSON.stringify({
      content: content,
      message_id: userMessage.id
    }))
    
    inputMessage.value = ''
    // 清空推荐回复
    suggestedReplies.value = []
    // 重置 textarea 高度
    if (messageInputRef.value) {
      messageInputRef.value.style.height = 'auto'
    }
  } catch (e) {
    console.error('发送AI好友消息失败:', e)
    showToast('发送消息失败', 'error')
  }
}

// 生成推荐回复
const generateSuggestedReply = async (messageContent) => {
  console.log('generateSuggestedReply 被调用，消息内容:', messageContent)
  
  // 如果正在生成，跳过
  if (isGeneratingReply.value) {
    console.log('正在生成中，跳过')
    return
  }
  
  // 清空之前的推荐回复
  suggestedReplies.value = []
  
  // 如果消息为空或太长，跳过
  if (!messageContent || !messageContent.trim() || messageContent.length > 500) {
    console.log('消息无效，跳过生成:', { messageContent, length: messageContent?.length })
    return
  }
  
  console.log('开始生成推荐回复...')
  isGeneratingReply.value = true
  
  try {
    // 构建对话上下文（最近几条消息）
    const recentMessages = messages.value
      .filter(msg => msg.type !== 'system' && msg.media_type !== 'system' && !msg.is_recalled)
      .slice(-5) // 取最近5条消息作为上下文
    
    // 构建消息历史（从我的视角：对方的消息是 'user'，我的消息是 'assistant'）
    const messageHistory = recentMessages.map(msg => ({
      role: msg.sender_id === props.user.id ? 'assistant' : 'user', // 我发送的是回复(assistant)，对方发送的是问题(user)
      content: msg.content
    }))
    
    // 添加当前收到的消息（对方刚发的，应该作为 'user'）
    messageHistory.push({
      role: 'user', // 对方刚问我的问题
      content: messageContent
    })
    
    // 添加系统提示
    const systemPrompt = '你是一个聊天助手，根据对方的问题，生成3个简短、自然、友好的回复建议。每个回复建议不超过20个字，要符合中文聊天习惯。只返回回复内容，不要添加任何解释、序号或标点符号。用换行符分隔每个回复。'
    
    console.log('消息历史:', messageHistory)
    
    const response = await deepseek.chat([
      { role: 'system', content: systemPrompt },
      ...messageHistory
    ], {
      model: 'deepseek-chat',
      temperature: 0.8,
      max_tokens: 150
    })
    
    if (response.code === 200 && response.data && response.data.choices && response.data.choices.length > 0) {
      const aiReply = response.data.choices[0].message.content
      
      // 解析回复，按换行符分割
      const replies = aiReply
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && line.length <= 50) // 过滤空行和过长的回复
        .slice(0, 3) // 最多取3个
      
      if (replies.length > 0) {
        suggestedReplies.value = replies
        console.log('推荐回复生成成功:', replies)
      } else {
        console.log('推荐回复为空')
      }
    } else {
      console.log('API 响应异常:', response)
    }
  } catch (error) {
    console.error('生成推荐回复失败:', error)
    // 静默失败，不显示错误提示
  } finally {
    isGeneratingReply.value = false
  }
}

// 使用推荐回复
const useSuggestedReply = (reply) => {
  inputMessage.value = reply
  // 自动聚焦到输入框
  if (messageInputRef.value) {
    messageInputRef.value.focus()
  }
  // 清空推荐回复
  suggestedReplies.value = []
}

// 清空推荐回复（在切换聊天或发送消息时调用）
const clearSuggestedReplies = () => {
  suggestedReplies.value = []
  lastMessageForSuggestion.value = null
}

// 关闭推荐回复（用户手动关闭）
const closeSuggestedReplies = () => {
  suggestedReplies.value = []
}

// 显示消息右键菜单
const showMessageContextMenu = (event, msg) => {
  event.preventDefault()
  event.stopPropagation() // 阻止事件冒泡到容器
  selectedMessage.value = msg
  contextMenuPosition.value = {
    x: event.clientX,
    y: event.clientY
  }
  showContextMenu.value = true
}

// 关闭右键菜单
const closeContextMenu = () => {
  showContextMenu.value = false
  selectedMessage.value = null
  // 同时关闭收藏项右键菜单
  closeFavoriteContextMenu()
}

// 处理消息容器的点击事件
const handleMessagesContainerClick = (event) => {
  // 多选模式下，点击消息项切换选中状态
  if (isMultiSelectMode.value) {
    const messageItem = event.target.closest('.message-item')
    if (messageItem && !event.target.closest('.message-checkbox') && !event.target.closest('.forwarded-message-card')) {
      // 找到消息ID
      const messageId = parseInt(messageItem.dataset.messageId)
      if (messageId) {
        const msg = displayMessages.value.find(m => m.id === messageId)
        if (msg && !isSystemMessage(msg) && !msg.is_recalled && !deletedMessageIds.value.has(msg.id)) {
          toggleMessageSelection(messageId)
        }
      }
      return
    }
  }
  
  // 检查是否点击了"发送朋友验证"按钮
  const sendVerificationBtn = event.target.closest('.send-verification-btn')
  if (sendVerificationBtn) {
    event.preventDefault()
    event.stopPropagation()
    
    const receiverId = sendVerificationBtn.getAttribute('data-receiver-id')
    const receiverName = sendVerificationBtn.getAttribute('data-receiver-name')
    const receiverUsername = sendVerificationBtn.getAttribute('data-receiver-username')
    const receiverEmail = sendVerificationBtn.getAttribute('data-receiver-email')
    const receiverAvatar = sendVerificationBtn.getAttribute('data-receiver-avatar')
    
    if (receiverId) {
      // 打开申请添加好友弹窗
      openFriendRequestModalFromSystemNotification({
        id: parseInt(receiverId),
        name: receiverName,
        username: receiverUsername,
        email: receiverEmail,
        avatar: receiverAvatar
      })
    }
    return
  }
  
  // 其他点击事件（关闭右键菜单等）
  closeContextMenu()
  // 关闭聊天列表右键菜单
  closeChatContextMenu()
  // 关闭收藏项右键菜单
  closeFavoriteContextMenu()
}

// 处理消息容器的右键事件（仅在空白处）
const handleMessagesContainerContextMenu = (event) => {
  // 检查点击的目标是否是消息内容区域（message-content）或消息项
  const messageContent = event.target.closest('.message-content')
  const messageItem = event.target.closest('.message-item')
  
  // 如果是消息内容区域，说明是有效的消息右键，让消息内容的事件处理
  if (messageContent) {
    // 消息内容区域的事件会自己处理，这里只需要阻止冒泡
    event.preventDefault()
    event.stopPropagation()
    return
  }
  
  // 如果是消息项但不是消息内容（比如在消息项的空白区域），不显示菜单
  if (messageItem) {
    event.preventDefault()
    event.stopPropagation()
    // 关闭任何已打开的右键菜单
    closeContextMenu()
    // 关闭聊天列表右键菜单
    closeChatContextMenu()
    // 关闭收藏项右键菜单
    closeFavoriteContextMenu()
    return
  }
  
  // 如果不是消息项（即真正的空白处），则阻止默认行为，不显示菜单
  event.preventDefault()
  event.stopPropagation()
  // 关闭任何已打开的右键菜单
  closeContextMenu()
  // 关闭聊天列表右键菜单
  closeChatContextMenu()
  // 关闭收藏项右键菜单
  closeFavoriteContextMenu()
}

// 处理列表容器的右键事件（仅在空白处）
const handleListContentContextMenu = (event) => {
  // 检查点击的目标是否是聊天列表项
  const chatItem = event.target.closest('.chat-item')
  
  // 如果是聊天列表项，不做任何处理，让聊天列表项自己的事件处理
  if (chatItem) {
    // 不阻止事件，让聊天列表项的 @contextmenu 处理
    return
  }
  
  // 如果不是聊天列表项（即空白处），则阻止默认行为，关闭菜单
  event.preventDefault()
  event.stopPropagation()
  // 关闭聊天列表右键菜单
  closeChatContextMenu()
}

// 显示聊天列表右键菜单
const openChatContextMenu = (event, item) => {
  event.preventDefault()
  event.stopPropagation() // 阻止事件冒泡到 list-content
  selectedChatItem.value = item
  chatContextMenuPosition.value = {
    x: event.clientX,
    y: event.clientY
  }
  showChatContextMenu.value = true
}

// 关闭聊天列表右键菜单
const closeChatContextMenu = () => {
  showChatContextMenu.value = false
  selectedChatItem.value = null
  // 同时关闭收藏项右键菜单
  closeFavoriteContextMenu()
}

// 置顶聊天
const handlePinChat = async () => {
  if (!selectedChatItem.value || !selectedChatItem.value.room) {
    return
  }
  
  const room = selectedChatItem.value.room
  
  try {
    const data = await messagesApi.pin(room)
    if (data.code === 200) {
      // 更新本地聊天列表的置顶状态
      chatList.value = chatList.value.map(item => {
        if (item.room === room) {
          return { ...item, is_pinned: 1 }
        }
        return item
      })
      showToast('已置顶', 'success')
    } else {
      showToast(data.message || '置顶失败', 'error')
    }
  } catch (e) {
    console.error('置顶聊天失败:', e)
    showToast('置顶失败，请稍后重试', 'error')
  }
  
  closeChatContextMenu()
}

// 取消置顶聊天
const handleUnpinChat = async () => {
  if (!selectedChatItem.value || !selectedChatItem.value.room) {
    return
  }
  
  const room = selectedChatItem.value.room
  
  try {
    const data = await messagesApi.unpin(room)
    if (data.code === 200) {
      // 更新本地聊天列表的置顶状态
      chatList.value = chatList.value.map(item => {
        if (item.room === room) {
          return { ...item, is_pinned: 0 }
        }
        return item
      })
      showToast('已取消置顶', 'success')
    } else {
      showToast(data.message || '取消置顶失败', 'error')
    }
  } catch (e) {
    console.error('取消置顶聊天失败:', e)
    showToast('取消置顶失败，请稍后重试', 'error')
  }
  
  closeChatContextMenu()
}
// 消息免打扰
const handleMuteChat = async () => {
  if (!selectedChatItem.value || !selectedChatItem.value.room) {
    return
  }
  
  const room = selectedChatItem.value.room
  
  try {
    const data = await messagesApi.mute(room)
    if (data.code === 200) {
      // 更新本地聊天列表的免打扰状态
      chatList.value = chatList.value.map(item => {
        if (item.room === room) {
          return { ...item, is_muted: 1 }
        }
        return item
      })
      showToast('已设置免打扰', 'success')
    } else {
      showToast(data.message || '设置免打扰失败', 'error')
    }
  } catch (e) {
    console.error('设置免打扰失败:', e)
    showToast('设置免打扰失败，请稍后重试', 'error')
  }
  
  closeChatContextMenu()
}

// 取消免打扰（允许消息通知）
const handleUnmuteChat = async () => {
  if (!selectedChatItem.value || !selectedChatItem.value.room) {
    return
  }
  
  const room = selectedChatItem.value.room
  
  try {
    const data = await messagesApi.unmute(room)
    if (data.code === 200) {
      // 更新本地聊天列表的免打扰状态
      chatList.value = chatList.value.map(item => {
        if (item.room === room) {
          return { ...item, is_muted: 0 }
        }
        return item
      })
      showToast('已允许消息通知', 'success')
    } else {
      showToast(data.message || '取消免打扰失败', 'error')
    }
  } catch (e) {
    console.error('取消免打扰失败:', e)
    showToast('取消免打扰失败，请稍后重试', 'error')
  }
  
  closeChatContextMenu()
}

// 判断是否是已解散的群聊
const isDisbandedGroupChat = (chatItem) => {
  if (!chatItem) return false
  const chatType = chatItem.chat_type || (chatItem.group_id ? 'group' : 'private')
  return chatType === 'group' && chatItem.is_disbanded === 1
}

// 处理删除聊天（打开确认弹窗）
const handleDeleteChat = () => {
  if (!selectedChatItem.value) return
  
  // 保存聊天信息，因为关闭右键菜单会清空 selectedChatItem
  const chatItem = { ...selectedChatItem.value }
  const chatName = chatItem.remark || chatItem.name || '群聊'
  deleteChatName.value = chatName
  deleteChatRoom.value = chatItem.room
  deleteChatItem.value = chatItem
  showDeleteChatConfirm.value = true
  closeChatContextMenu()
}

// 删除已解散的群聊
const deleteChat = async () => {
  if (!deleteChatRoom.value || !deleteChatItem.value) {
    return
  }
  
  const room = deleteChatRoom.value
  
  // 再次验证是否是已解散的群聊
  if (!isDisbandedGroupChat(deleteChatItem.value)) {
    showToast('只能删除已解散的群聊', 'error')
    showDeleteChatConfirm.value = false
    deleteChatRoom.value = null
    deleteChatItem.value = null
    return
  }
  
  deletingChat.value = true
  
  try {
    const data = await messagesApi.deleteChat(room)
    if (data.code === 200) {
      showToast('已删除', 'success')
      
      // 如果当前正在查看该聊天，关闭聊天窗口
      if (currentRoom.value === room) {
        currentRoom.value = null
        currentChatInfo.value = null
        messages.value = []
        deletedMessageIds.value.clear()
        // 关闭WebSocket连接
        if (ws.value) {
          ws.value.close()
          ws.value = null
        }
      }
      
      // 从聊天列表中移除
      const wasCurrentChat = currentRoom.value === room
      chatList.value = chatList.value.filter(item => item.room !== room)
      
      // 如果删除的是当前聊天，且聊天列表还有其他聊天，切换到第一个聊天
      if (wasCurrentChat && chatList.value.length > 0) {
        await selectChat(chatList.value[0])
      } else if (chatList.value.length === 0) {
        // 如果聊天列表为空，确保清空当前聊天信息
        currentChatInfo.value = null
        currentRoom.value = null
      }
    } else {
      showToast(data.message || '删除失败', 'error')
    }
  } catch (e) {
    console.error('删除聊天失败:', e)
    showToast('删除失败，请稍后重试', 'error')
  } finally {
    deletingChat.value = false
    showDeleteChatConfirm.value = false
    deleteChatRoom.value = null
    deleteChatItem.value = null
  }
}

// 撤回消息
const handleRecallMessage = async () => {
  if (!selectedMessage.value || !selectedMessage.value.id) {
    return
  }
  
  // 检查权限
  if (!canRecallMessage(selectedMessage.value)) {
    showToast('你没有撤回该消息的权限', 'error')
    closeContextMenu()
    return
  }
  
  const messageId = selectedMessage.value.id
  const isOwnMessage = selectedMessage.value.sender_id === props.user.id
  const isRecallByOther = !isOwnMessage && currentChatInfo.value?.type === 'group'
  
  // 检查是否在2分钟内
  // 处理created_at格式：可能是 "2024/1/1 12:00:00" 或 ISO格式
  let messageTime
  try {
    messageTime = new Date(selectedMessage.value.created_at.replace(/\//g, '-')).getTime()
    if (isNaN(messageTime)) {
      // 如果解析失败，尝试直接解析
      messageTime = new Date(selectedMessage.value.created_at).getTime()
    }
  } catch (e) {
    messageTime = new Date(selectedMessage.value.created_at).getTime()
  }
  const now = Date.now()
  const timeDiff = now - messageTime
  
  if (timeDiff > 120000) {
    showToast('消息发送超过2分钟，无法撤回', 'error')
    closeContextMenu()
    return
  }
  
  try {
    const data = await messagesApi.recall(messageId)
    if (data.code === 200) {
      // 更新本地消息状态
      let recallText = ''
      if (isRecallByOther) {
        // 他人撤回的消息（群主或管理员撤回成员消息）
        // 获取操作者的显示名称（当前用户）
        let operatorDisplayName = '你'
        if (currentChatInfo.value?.type === 'group') {
          const operatorMember = groupMembers.value.find(m => m.user_id === props.user.id)
          if (operatorMember) {
            operatorDisplayName = getMemberDisplayName(operatorMember)
          } else {
            operatorDisplayName = props.user.name || props.user.username || '你'
          }
        }
        recallText = `${operatorDisplayName}撤回了一条成员消息`
      } else if (isOwnMessage) {
        recallText = '你撤回了一条消息'
      } else {
        // 获取发送者的显示名称
        let displayName = '用户'
        if (currentChatInfo.value?.type === 'group') {
          // 群聊：优先使用群聊昵称，然后是备注，然后是个人昵称，最后是用户名
          const member = groupMembers.value.find(m => m.user_id === selectedMessage.value.sender_id)
          if (member) {
            displayName = getMemberDisplayName(member)
          } else {
            // 如果找不到群成员信息，使用消息中的nickname或name
            displayName = selectedMessage.value.nickname || selectedMessage.value.name || '用户'
          }
        } else {
          // 私聊：优先使用备注，其次是昵称，最后是用户名
          displayName = currentChatInfo.value?.name || '对方'
        }
        recallText = `${displayName}撤回了一条消息`
      }
      messages.value = messages.value.map(msg => {
        if (msg.id === messageId) {
          return { ...msg, is_recalled: 1, content: recallText }
        }
        return msg
      })
      showToast('消息已撤回', 'success')
      // 刷新聊天列表
      setTimeout(() => {
        loadChatList()
      }, 300)
    } else {
      showToast(data.message || '撤回失败', 'error')
    }
  } catch (e) {
    console.error('撤回消息失败:', e)
    showToast('撤回失败，请稍后重试', 'error')
  }
  
  closeContextMenu()
}

// 删除消息
const handleDeleteMessage = async () => {
  if (!selectedMessage.value || !selectedMessage.value.id) {
    return
  }
  
  const messageId = selectedMessage.value.id
  
  try {
    const data = await messagesApi.delete(messageId)
    if (data.code === 200) {
      // 添加到已删除消息集合
      deletedMessageIds.value.add(messageId)
      showToast('消息已删除', 'success')
    } else {
      showToast(data.message || '删除失败', 'error')
    }
  } catch (e) {
    console.error('删除消息失败:', e)
    showToast('删除失败，请稍后重试', 'error')
  }
  
  closeContextMenu()
}

// 转发消息
const handleForwardMessage = () => {
  if (!selectedMessage.value) return
  forwardMessage.value = selectedMessage.value
  showForwardModal.value = true
  closeContextMenu()
}

// 执行转发
const executeForward = async () => {
  if (!forwardMessage.value || !forwardTarget.value) {
    showToast('请选择转发目标', 'error')
    return
  }
  
  try {
    const data = await messagesApi.forward(forwardMessage.value.id, forwardTarget.value.room)
    if (data.code === 200) {
      showToast('消息已转发', 'success')
      closeForwardModal()
    } else {
      showToast(data.message || '转发失败', 'error')
    }
  } catch (e) {
    console.error('转发消息失败:', e)
    showToast('转发失败，请重试', 'error')
  }
}

// 关闭转发模态框
const closeForwardModal = () => {
  showForwardModal.value = false
  forwardMessage.value = null
  forwardTarget.value = null
}

// 多选消息相关函数
const handleMultiSelect = () => {
  if (!selectedMessage.value) return
  isMultiSelectMode.value = true
  selectedMessages.value.clear()
  selectedMessages.value.add(selectedMessage.value.id)
  closeContextMenu()
}

const toggleMessageSelection = (messageId) => {
  if (selectedMessages.value.has(messageId)) {
    selectedMessages.value.delete(messageId)
  } else {
    selectedMessages.value.add(messageId)
  }
}

const exitMultiSelectMode = () => {
  isMultiSelectMode.value = false
  selectedMessages.value.clear()
}

const openMultiForwardModal = () => {
  if (selectedMessages.value.size === 0) {
    showToast('请至少选择一条消息', 'error')
    return
  }
  showMultiForwardModal.value = true
  multiForwardTarget.value = null
}

const closeMultiForwardModal = () => {
  showMultiForwardModal.value = false
  multiForwardTarget.value = null
}

const getSelectedMessagesList = () => {
  return displayMessages.value.filter(msg => selectedMessages.value.has(msg.id) && !isSystemMessage(msg))
}

const getForwardChatTitle = () => {
  if (!currentChatInfo.value) return '聊天记录'
  if (currentChatInfo.value.type === 'private') {
    return `与${currentChatInfo.value.name}的聊天记录`
  } else {
    return `群${currentChatInfo.value.name}的聊天记录`
  }
}

const executeMultiForward = async () => {
  if (!multiForwardTarget.value || selectedMessages.value.size === 0) {
    showToast('请选择转发目标', 'error')
    return
  }
  
  const messageIds = Array.from(selectedMessages.value)
  
  try {
    const data = await messagesApi.forwardMultiple(messageIds, multiForwardTarget.value.room)
    if (data.code === 200) {
      showToast('消息已转发', 'success')
      closeMultiForwardModal()
      exitMultiSelectMode()
    } else {
      showToast(data.message || '转发失败', 'error')
    }
  } catch (e) {
    console.error('转发消息失败:', e)
    showToast('转发失败，请重试', 'error')
  }
}

// 批量收藏选中的消息（合并为一条聊天记录）
const handleMultiFavorite = async () => {
  if (selectedMessages.value.size === 0) {
    showToast('请至少选择一条消息', 'error')
    return
  }
  
  const selectedMessagesList = getSelectedMessagesList()
  if (selectedMessagesList.length === 0) {
    showToast('没有可收藏的消息', 'error')
    return
  }
  
  // 获取当前聊天信息
  if (!currentChatInfo.value) {
    showToast('无法获取聊天信息', 'error')
    return
  }
  
  try {
    // 构建转发消息格式的JSON对象
    const forwardData = {
      chat_title: currentChatInfo.value.name || '聊天',
      chat_type: currentChatInfo.value.type || 'private',
      messages: selectedMessagesList.map(msg => {
        // 构建消息对象，包含必要的字段
        // 注意：使用 sender_avatar 和 sender_name 以匹配转发消息详情弹窗的显示逻辑
        const messageObj = {
          id: msg.id,
          sender_id: msg.sender_id,
          sender_name: msg.nickname || '用户',
          sender_avatar: msg.avatar || null,
          nickname: msg.nickname || '用户', // 保留nickname字段以兼容
          avatar: msg.avatar || null, // 保留avatar字段以兼容
          type: msg.type || 'text',
          media_type: msg.media_type || msg.type || 'text',
          content: msg.content,
          created_at: msg.created_at
        }
        
        // 如果是文件类型，添加文件大小
        if (msg.type === 'file' || msg.media_type === 'file') {
          messageObj.file_size = msg.file_size || null
        }
        
        // 如果是转发消息，保留forward_info
        if (msg.media_type === 'forward_multiple' && msg.forward_info) {
          messageObj.forward_info = msg.forward_info
        } else if (msg.media_type === 'forward_multiple' && msg.content) {
          // 如果forward_info不存在，尝试从content解析
          try {
            const parsedContent = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content
            if (parsedContent && parsedContent.chat_title) {
              messageObj.forward_info = parsedContent
            }
          } catch (e) {
            // 解析失败，忽略
          }
        }
        
        return messageObj
      })
    }
    
    // 将转发数据转换为JSON字符串
    const content = JSON.stringify(forwardData)
    
    // 使用第一条消息的ID作为message_id
    const messageId = selectedMessagesList[0].id
    
    // 调用收藏API，类型为'message'，内容为转发消息格式的JSON
    const data = await messagesApi.addFavorite(messageId, 'message', content, null)
    
    if (data.code === 200) {
      showToast(`已收藏 ${selectedMessagesList.length} 条消息`, 'success')
      if (currentTab.value === 'favorites') {
        loadFavorites()
      }
      exitMultiSelectMode()
    } else {
      showToast(data.message || '收藏失败', 'error')
    }
  } catch (e) {
    console.error('收藏消息失败:', e)
    showToast('收藏失败，请重试', 'error')
  }
}

// 转发消息显示相关函数
const getForwardMessageTitle = (msg) => {
  let forwardInfo = msg.forward_info
  // 如果没有forward_info，尝试从content中解析
  if (!forwardInfo && msg.media_type === 'forward_multiple') {
    try {
      forwardInfo = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content
    } catch (e) {
      console.error('解析转发消息内容失败:', e)
    }
  }
  
  if (forwardInfo) {
    if (forwardInfo.chat_type === 'private') {
      return `与${forwardInfo.chat_title}的聊天记录`
    } else {
      return `群${forwardInfo.chat_title}的聊天记录`
    }
  }
  return '聊天记录'
}

const getForwardMessagePreview = (msg) => {
  let forwardInfo = msg.forward_info
  // 如果没有forward_info，尝试从content中解析
  if (!forwardInfo && msg.media_type === 'forward_multiple') {
    try {
      forwardInfo = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content
    } catch (e) {
      console.error('解析转发消息内容失败:', e)
    }
  }
  
  if (forwardInfo && forwardInfo.messages) {
    const count = forwardInfo.messages.length
    return `共${count}条消息`
  }
  return '转发消息'
}

const showForwardMessagesModal = (msg) => {
  // 如果弹窗已经打开，先保存当前状态到栈中
  if (showForwardMessagesDetailModal.value) {
    forwardMessagesDetailStack.value.push({
      title: forwardMessagesDetailTitle.value,
      messages: [...forwardMessagesDetailList.value]
    })
  }
  
  if (msg.forward_info && msg.forward_info.messages) {
    forwardMessagesDetailTitle.value = getForwardMessageTitle(msg)
    forwardMessagesDetailList.value = msg.forward_info.messages
    showForwardMessagesDetailModal.value = true
  } else if (msg.media_type === 'forward_multiple') {
    try {
      const forwardData = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content
      if (forwardData.messages) {
        forwardMessagesDetailTitle.value = forwardData.chat_type === 'private' 
          ? `与${forwardData.chat_title}的聊天记录`
          : `群${forwardData.chat_title}的聊天记录`
        forwardMessagesDetailList.value = forwardData.messages
        showForwardMessagesDetailModal.value = true
      }
    } catch (e) {
      console.error('解析转发消息失败:', e)
    }
  }
}

// 显示嵌套的转发消息详情（在转发消息详情弹窗中）
const showNestedForwardMessagesModal = (msg) => {
  try {
    // 保存当前状态到栈中
    if (showForwardMessagesDetailModal.value) {
      forwardMessagesDetailStack.value.push({
        title: forwardMessagesDetailTitle.value,
        messages: [...forwardMessagesDetailList.value]
      })
    }
    
    let forwardData = null
    
    // 优先使用forward_info
    if (msg.forward_info && msg.forward_info.messages) {
      forwardData = msg.forward_info
    } else if (msg.media_type === 'forward_multiple') {
      // 从content中解析
      forwardData = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content
    } else if (msg.content) {
      // 尝试解析content
      try {
        const parsed = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content
        if (parsed && parsed.chat_title && parsed.chat_type && Array.isArray(parsed.messages)) {
          forwardData = parsed
        }
      } catch (e) {
        console.error('解析嵌套转发消息失败:', e)
        return
      }
    }
    
    if (forwardData && forwardData.messages) {
      forwardMessagesDetailTitle.value = forwardData.chat_type === 'private' 
        ? `与${forwardData.chat_title}的聊天记录`
        : `群${forwardData.chat_title}的聊天记录`
      forwardMessagesDetailList.value = forwardData.messages
      showForwardMessagesDetailModal.value = true
    }
  } catch (e) {
    console.error('显示嵌套转发消息失败:', e)
  }
}

// 返回上一级转发消息详情
const goBackForwardMessagesDetail = () => {
  if (forwardMessagesDetailStack.value.length > 0) {
    const previous = forwardMessagesDetailStack.value.pop()
    forwardMessagesDetailTitle.value = previous.title
    forwardMessagesDetailList.value = previous.messages
  } else {
    closeForwardMessagesDetailModal()
  }
}

// 处理转发消息详情弹窗关闭（如果有上一级则返回，否则关闭）
const handleForwardMessagesDetailClose = () => {
  if (forwardMessagesDetailStack.value.length > 0) {
    goBackForwardMessagesDetail()
  } else {
    closeForwardMessagesDetailModal()
  }
}

// 处理点击遮罩层（如果有上一级则返回，否则关闭）
const handleForwardMessagesDetailOverlayClick = () => {
  if (forwardMessagesDetailStack.value.length > 0) {
    goBackForwardMessagesDetail()
  } else {
    closeForwardMessagesDetailModal()
  }
}

// 关闭转发消息详情弹窗（完全关闭）
const closeForwardMessagesDetailModal = () => {
  showForwardMessagesDetailModal.value = false
  forwardMessagesDetailTitle.value = ''
  forwardMessagesDetailList.value = []
  forwardMessagesDetailStack.value = []
}

// 收藏相关函数
const loadFavorites = async () => {
  try {
    const data = await messagesApi.getFavorites()
    if (data.code === 200) {
      favoritesList.value = data.data || []
    } else {
      showToast(data.message || '加载收藏失败', 'error')
    }
  } catch (e) {
    console.error('加载收藏失败:', e)
    showToast('加载收藏失败，请重试', 'error')
  }
}

const addFavorite = async (messageId, type, content, fileSize = null) => {
  try {
    const data = await messagesApi.addFavorite(messageId, type, content, fileSize)
    if (data.code === 200) {
      showToast('已收藏', 'success')
      if (currentTab.value === 'favorites') {
        loadFavorites()
      }
    } else {
      showToast(data.message || '收藏失败', 'error')
    }
  } catch (e) {
    console.error('收藏失败:', e)
    showToast('收藏失败，请重试', 'error')
  }
}

const removeFavorite = async (favoriteId) => {
  try {
    const data = await messagesApi.removeFavorite(favoriteId)
    if (data.code === 200) {
      showToast('已取消收藏', 'success')
      loadFavorites()
    } else {
      showToast(data.message || '取消收藏失败', 'error')
    }
  } catch (e) {
    console.error('取消收藏失败:', e)
    showToast('取消收藏失败，请重试', 'error')
  }
}

// 显示收藏项右键菜单
const openFavoriteContextMenu = (event, item) => {
  event.preventDefault()
  event.stopPropagation()
  selectedFavoriteItem.value = item
  favoriteContextMenuPosition.value = {
    x: event.clientX,
    y: event.clientY
  }
  showFavoriteContextMenu.value = true
}

// 关闭收藏项右键菜单
const closeFavoriteContextMenu = () => {
  showFavoriteContextMenu.value = false
  selectedFavoriteItem.value = null
}

// 处理收藏项删除
const handleRemoveFavorite = async () => {
  if (!selectedFavoriteItem.value || !selectedFavoriteItem.value.id) {
    return
  }
  
  const favoriteId = selectedFavoriteItem.value.id
  await removeFavorite(favoriteId)
  closeFavoriteContextMenu()
}

// 处理收藏文件下载
const handleDownloadFavoriteFile = () => {
  if (!selectedFavoriteItem.value || selectedFavoriteItem.value.type !== 'file') {
    return
  }
  
  downloadFile(selectedFavoriteItem.value.content, 'file')
  closeFavoriteContextMenu()
}

// 处理收藏项转发
const handleForwardFavorite = async () => {
  if (!selectedFavoriteItem.value || !selectedFavoriteItem.value.message_id) {
    return
  }
  
  // 将收藏项转换为消息格式用于转发
  const favoriteItem = selectedFavoriteItem.value
  
  // 检查是否是转发消息
  let isForward = false
  let mediaType = favoriteItem.type === 'message' ? 'text' : favoriteItem.type
  
  if (favoriteItem.type === 'message' && favoriteItem.content) {
    // 检查是否是转发消息（JSON格式）
    try {
      const contentData = typeof favoriteItem.content === 'string' ? JSON.parse(favoriteItem.content) : favoriteItem.content
      if (contentData && contentData.chat_title && contentData.chat_type && Array.isArray(contentData.messages)) {
        isForward = true
        mediaType = 'forward_multiple'
      }
    } catch (e) {
      // 不是JSON格式，继续处理
    }
  }
  
  const messageForForward = {
    id: favoriteItem.message_id,
    type: favoriteItem.type === 'message' ? 'text' : favoriteItem.type,
    content: favoriteItem.content,
    file_size: favoriteItem.file_size,
    media_type: mediaType,
    forward_info: isForward ? (typeof favoriteItem.content === 'string' ? JSON.parse(favoriteItem.content) : favoriteItem.content) : null
  }
  
  forwardMessage.value = messageForForward
  showForwardModal.value = true
  closeFavoriteContextMenu()
}

const getFavoriteCategoryTitle = () => {
  const titles = {
    'all': '全部收藏',
    'image': '图片',
    'file': '文件',
    'message': '聊天记录'
  }
  return titles[favoriteCategory.value] || '收藏'
}

const formatFavoriteTime = (timeStr) => {
  if (!timeStr) return ''
  try {
    const date = new Date(timeStr)
    return date.toLocaleString('zh-CN', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  } catch (e) {
    return timeStr
  }
}

const handleAddFavorite = () => {
  if (!selectedMessage.value) return
  const msg = selectedMessage.value
  
  let type = 'message'
  let content = msg.content
  let fileSize = null
  
  // 如果是转发消息，需要保存完整的转发信息
  if (msg.media_type === 'forward_multiple') {
    type = 'message'
    // 如果有forward_info，使用forward_info；否则使用content
    if (msg.forward_info) {
      content = JSON.stringify(msg.forward_info)
    } else {
      // content已经是JSON字符串，直接使用
      content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
    }
  } else if (msg.media_type === 'image' || msg.type === 'image') {
    type = 'image'
    content = msg.content
  } else if (msg.media_type === 'file' || msg.type === 'file') {
    type = 'file'
    content = msg.content
    fileSize = msg.file_size
  } else {
    type = 'message'
    content = msg.content
  }
  
  addFavorite(msg.id, type, content, fileSize)
  closeContextMenu()
}

// 判断是否是转发消息
const isForwardMessage = (content) => {
  if (!content) return false
  try {
    const data = typeof content === 'string' ? JSON.parse(content) : content
    return data && data.chat_title && data.chat_type && Array.isArray(data.messages)
  } catch (e) {
    return false
  }
}

// 判断是否是JSON字符串
const isJsonString = (str) => {
  if (!str || typeof str !== 'string') return false
  try {
    JSON.parse(str)
    return true
  } catch (e) {
    return false
  }
}

// 判断是否是嵌套的转发消息（在转发消息详情中）
const isNestedForwardMessage = (msg) => {
  if (!msg || !msg.content) return false
  // 如果media_type已经是forward_multiple，直接返回true
  if (msg.media_type === 'forward_multiple') return true
  // 检查content是否是转发消息的JSON格式
  try {
    const data = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content
    return data && data.chat_title && data.chat_type && Array.isArray(data.messages)
  } catch (e) {
    return false
  }
}

// 获取嵌套转发消息的标题
const getNestedForwardMessageTitle = (msg) => {
  try {
    let forwardData = null
    if (msg.media_type === 'forward_multiple' && msg.forward_info) {
      forwardData = msg.forward_info
    } else if (msg.content) {
      forwardData = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content
    }
    
    if (forwardData && forwardData.chat_title) {
      if (forwardData.chat_type === 'private') {
        return `与${forwardData.chat_title}的聊天记录`
      } else {
        return `群${forwardData.chat_title}的聊天记录`
      }
    }
  } catch (e) {
    console.error('解析嵌套转发消息失败:', e)
  }
  return '聊天记录'
}

// 获取嵌套转发消息的预览
const getNestedForwardMessagePreview = (msg) => {
  try {
    let forwardData = null
    if (msg.media_type === 'forward_multiple' && msg.forward_info) {
      forwardData = msg.forward_info
    } else if (msg.content) {
      forwardData = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content
    }
    
    if (forwardData && forwardData.messages) {
      const count = forwardData.messages.length
      return `共${count}条消息`
    }
  } catch (e) {
    console.error('解析嵌套转发消息失败:', e)
  }
  return '转发消息'
}

// 获取收藏的转发消息标题
const getFavoriteForwardTitle = (content) => {
  try {
    const data = typeof content === 'string' ? JSON.parse(content) : content
    if (data && data.chat_title) {
      if (data.chat_type === 'private') {
        return `与${data.chat_title}的聊天记录`
      } else {
        return `群${data.chat_title}的聊天记录`
      }
    }
  } catch (e) {
    console.error('解析转发消息失败:', e)
  }
  return '聊天记录'
}

// 获取收藏的转发消息预览
const getFavoriteForwardPreview = (content) => {
  try {
    const data = typeof content === 'string' ? JSON.parse(content) : content
    if (data && data.messages && Array.isArray(data.messages)) {
      return `共${data.messages.length}条消息`
    }
  } catch (e) {
    console.error('解析转发消息失败:', e)
  }
  return '转发消息'
}

// 获取收藏消息的来源文本
const getFavoriteSourceText = (item) => {
  if (!item.chat_title) return ''
  
  if (item.chat_type === 'private') {
    return `来自与${item.chat_title}的聊天`
  } else if (item.chat_type === 'group') {
    return `来自群聊${item.chat_title}`
  }
  
  return ''
}

// 显示收藏的转发消息详情
const showFavoriteForwardMessages = (item) => {
  try {
    const forwardData = typeof item.content === 'string' ? JSON.parse(item.content) : item.content
    if (forwardData && forwardData.messages) {
      forwardMessagesDetailTitle.value = forwardData.chat_type === 'private' 
        ? `与${forwardData.chat_title}的聊天记录`
        : `群${forwardData.chat_title}的聊天记录`
      forwardMessagesDetailList.value = forwardData.messages
      showForwardMessagesDetailModal.value = true
    }
  } catch (e) {
    console.error('解析转发消息失败:', e)
  }
}

// 打开选择收藏弹窗
const openSelectFavoriteModal = async () => {
  if (isGroupDisbanded.value) {
    showToast('无法在已解散的群聊中发送消息', 'error')
    return
  }
  
  if (!ws.value || ws.value.readyState !== WebSocket.OPEN) {
    showToast('请先选择聊天对象', 'error')
    return
  }
  
  // 加载收藏列表
  await loadFavorites()
  selectedFavoritesForSend.value.clear()
  showSelectFavoriteModal.value = true
}

// 关闭选择收藏弹窗
const closeSelectFavoriteModal = () => {
  showSelectFavoriteModal.value = false
  selectedFavoritesForSend.value.clear()
}

// 切换收藏项选择
const toggleFavoriteSelection = (favoriteId) => {
  if (selectedFavoritesForSend.value.has(favoriteId)) {
    selectedFavoritesForSend.value.delete(favoriteId)
  } else {
    selectedFavoritesForSend.value.add(favoriteId)
  }
}

// 发送选中的收藏内容
const sendSelectedFavorites = async () => {
  if (selectedFavoritesForSend.value.size === 0) {
    showToast('请至少选择一项收藏', 'error')
    return
  }
  
  if (!ws.value || ws.value.readyState !== WebSocket.OPEN) {
    showToast('WebSocket未连接', 'error')
    return
  }
  
  const receiverId = currentChatInfo.value.type === 'group' 
    ? (currentChatInfo.value.group_id || currentChatInfo.value.id)
    : (currentChatInfo.value.user_id || props.user.id)
  
  // 获取选中的收藏项
  const selectedItems = favoritesList.value.filter(item => selectedFavoritesForSend.value.has(item.id))
  
  try {
    // 逐个发送收藏内容
    for (const item of selectedItems) {
      if (item.type === 'image') {
        // 发送图片：需要从URL获取图片数据
        try {
          const imageUrl = getImageUrl(item.content)
          const response = await fetch(imageUrl)
          const blob = await response.blob()
          const reader = new FileReader()
          reader.onload = (e) => {
            const base64Content = e.target.result.split(',')[1]
            const message = {
              sender_id: props.user.id,
              receiver_id: receiverId,
              type: 'image',
              content: base64Content,
              filename: getFileName(item.content)
            }
            ws.value.send(JSON.stringify(message))
          }
          reader.readAsDataURL(blob)
        } catch (e) {
          console.error('发送收藏图片失败:', e)
          showToast('发送图片失败', 'error')
        }
      } else if (item.type === 'file') {
        // 发送文件：需要从URL获取文件数据
        try {
          const fileUrl = getImageUrl(item.content)
          const response = await fetch(fileUrl)
          const blob = await response.blob()
          const reader = new FileReader()
          reader.onload = async (e) => {
            const base64Content = e.target.result.split(',')[1]
            
            // 发送文件开始标记
            const startMsg = {
              sender_id: props.user.id,
              receiver_id: receiverId,
              type: 'file',
              fileType: 'start',
              filename: getFileName(item.content),
              fileInfo: JSON.stringify({
                fileSize: blob.size,
                fileName: getFileName(item.content),
                fileType: blob.type
              })
            }
            ws.value.send(JSON.stringify(startMsg))
            
            // 分块发送文件
            const chunkSize = 64 * 1024 // 64KB chunks
            let offset = 0
            
            while (offset < base64Content.length) {
              const chunk = base64Content.slice(offset, offset + chunkSize)
              const uploadMsg = {
                sender_id: props.user.id,
                receiver_id: receiverId,
                type: 'file',
                fileType: 'upload',
                filename: getFileName(item.content),
                content: chunk
              }
              ws.value.send(JSON.stringify(uploadMsg))
              offset += chunkSize
            }
          }
          reader.readAsDataURL(blob)
        } catch (e) {
          console.error('发送收藏文件失败:', e)
          showToast('发送文件失败', 'error')
        }
      } else if (item.type === 'message') {
        // 发送消息：如果是转发消息，需要特殊处理
        if (isForwardMessage(item.content)) {
          // 转发消息：发送为转发消息格式
          const forwardData = typeof item.content === 'string' ? JSON.parse(item.content) : item.content
          const message = {
            sender_id: props.user.id,
            receiver_id: receiverId,
            type: 'text',
            media_type: 'forward_multiple',
            content: JSON.stringify(forwardData)
          }
          ws.value.send(JSON.stringify(message))
        } else {
          // 普通文本消息
          const message = {
            sender_id: props.user.id,
            receiver_id: receiverId,
            type: 'text',
            content: item.content
          }
          ws.value.send(JSON.stringify(message))
        }
      }
    }
    
    showToast(`已发送 ${selectedItems.length} 项收藏`, 'success')
    closeSelectFavoriteModal()
  } catch (e) {
    console.error('发送收藏内容失败:', e)
    showToast('发送失败，请重试', 'error')
  }
}

// 打开查找聊天记录弹窗
const openSearchHistory = async () => {
  if (!currentRoom.value || !currentChatInfo.value) return
  showSearchHistoryModal.value = true
  searchHistoryKeyword.value = ''
  searchHistoryFilter.value = 'all'
  selectedDate.value = null
  showDatePicker.value = false
  
  // 先加载日期列表，然后加载聊天记录
  await loadSearchHistory()
  // 初始化日期选择器到当前月份
  const now = new Date()
  selectedYear.value = now.getFullYear()
  selectedMonth.value = now.getMonth() + 1
  if (searchHistoryDates.value.length > 0) {
    loadDatePicker()
  }
}

// 关闭查找聊天记录弹窗
const closeSearchHistoryModal = () => {
  showSearchHistoryModal.value = false
  searchHistoryKeyword.value = ''
  searchHistoryFilter.value = 'all'
  selectedDate.value = null
  showDatePicker.value = false
  searchHistoryMessages.value = []
  // 移除日期选择器的事件监听
  document.removeEventListener('click', handleClickOutsideDatePicker)
}

// 加载聊天记录
const loadSearchHistory = async () => {
  if (!currentRoom.value || !currentChatInfo.value) return
  
  searchHistoryLoading.value = true
  try {
    const chatType = currentChatInfo.value.chat_type || (currentChatInfo.value.group_id ? 'group' : 'private')
    const options = {}
    
    if (searchHistoryKeyword.value.trim()) {
      options.keyword = searchHistoryKeyword.value.trim()
    }
    
    if (searchHistoryFilter.value !== 'all') {
      options.media_type = searchHistoryFilter.value
    }
    
    if (selectedDate.value) {
      options.date = selectedDate.value
    }
    
    const data = await messagesApi.searchHistory(currentRoom.value, chatType, options)
    
    if (data.code === 200 && data.data) {
      // 过滤掉系统通知（虽然后端已经排除，但前端也做一次过滤以确保）
      searchHistoryMessages.value = (data.data.messages || []).filter(msg => {
        return msg.media_type !== 'system' && msg.type !== 'system'
      })
      // 更新日期列表（用于日历显示）
      if (data.data.dates) {
        searchHistoryDates.value = data.data.dates
        // 如果日期选择器已打开，更新日历
        if (showDatePicker.value) {
          loadDatePicker()
        }
      }
    } else {
      searchHistoryMessages.value = []
      showToast(data.message || '加载失败', 'error')
    }
  } catch (e) {
    console.error('加载聊天记录失败:', e)
    searchHistoryMessages.value = []
    showToast('加载失败，请重试', 'error')
  } finally {
    searchHistoryLoading.value = false
  }
}

// 搜索输入处理（实时搜索）
let searchHistoryTimer = null
const handleSearchHistoryInput = () => {
  if (searchHistoryTimer) {
    clearTimeout(searchHistoryTimer)
  }
  // 防抖，300ms后执行搜索
  searchHistoryTimer = setTimeout(() => {
    loadSearchHistory()
  }, 300)
}

// 设置筛选类型
const setSearchHistoryFilter = (filter) => {
  searchHistoryFilter.value = filter
  loadSearchHistory()
}

// 日期选择器相关 ref
const dateFilterWrapper = ref(null)
const datePickerDropdown = ref(null)

// 切换日期选择器显示
const toggleDatePicker = () => {
  showDatePicker.value = !showDatePicker.value
  if (showDatePicker.value) {
    // 如果日期列表为空，先加载一次聊天记录获取日期列表
    if (searchHistoryDates.value.length === 0) {
      loadSearchHistory().then(() => {
        loadDatePicker()
        updateDatePickerPosition()
      })
    } else {
      loadDatePicker()
      updateDatePickerPosition()
    }
    // 添加点击外部区域关闭日期选择器的事件监听
    nextTick(() => {
      document.addEventListener('click', handleClickOutsideDatePicker)
    })
  } else {
    // 移除事件监听
    document.removeEventListener('click', handleClickOutsideDatePicker)
  }
}

// 更新日期选择器位置（使用 fixed 定位）
const updateDatePickerPosition = () => {
  nextTick(() => {
    if (!dateFilterWrapper.value || !datePickerDropdown.value) return
    
    const buttonRect = dateFilterWrapper.value.getBoundingClientRect()
    const dropdown = datePickerDropdown.value
    
    // 先临时显示以获取实际高度
    const originalDisplay = dropdown.style.display
    dropdown.style.display = 'block'
    const dropdownHeight = dropdown.offsetHeight
    dropdown.style.display = originalDisplay || ''
    
    // 计算可用空间
    const spaceBelow = window.innerHeight - buttonRect.bottom - 8
    const spaceAbove = buttonRect.top - 8
    
    let top, left
    
    // 如果下方空间足够，显示在下方
    if (spaceBelow >= dropdownHeight) {
      top = buttonRect.bottom + 8
      left = buttonRect.left
    } 
    // 如果下方空间不足但上方空间足够，显示在上方
    else if (spaceAbove >= dropdownHeight) {
      top = buttonRect.top - dropdownHeight - 8
      left = buttonRect.left
    }
    // 如果上下都不够，优先显示在下方，但调整位置使其尽可能可见
    else {
      // 显示在下方，但确保不会超出视口
      const maxTop = window.innerHeight - dropdownHeight - 8
      top = Math.min(buttonRect.bottom + 8, maxTop)
      left = buttonRect.left
      
      // 如果仍然超出，尝试显示在上方
      if (top + dropdownHeight > window.innerHeight) {
        top = Math.max(buttonRect.top - dropdownHeight - 8, 8)
      }
    }
    
    // 确保不会超出视口左边界
    if (left < 8) {
      left = 8
    }
    
    // 确保不会超出视口右边界
    const maxLeft = window.innerWidth - dropdown.offsetWidth - 8
    if (left > maxLeft) {
      left = maxLeft
    }
    
    // 设置 fixed 定位的位置
    dropdown.style.top = `${top}px`
    dropdown.style.left = `${left}px`
  })
}

// 处理日期选择器中的年份/月份改变
const handleDateSelectChange = () => {
  loadDatePicker()
  updateDatePickerPosition()
}

// 处理点击外部区域关闭日期选择器
const handleClickOutsideDatePicker = (event) => {
  // 检查点击是否在日期选择器外部
  const dateFilterWrapper = event.target.closest('.date-filter-wrapper')
  if (!dateFilterWrapper && showDatePicker.value) {
    showDatePicker.value = false
    document.removeEventListener('click', handleClickOutsideDatePicker)
  }
}

// 加载日期选择器
const loadDatePicker = () => {
  const year = selectedYear.value
  const month = selectedMonth.value
  
  // 获取该月第一天是星期几
  const firstDay = new Date(year, month - 1, 1).getDay()
  // 获取该月有多少天
  const daysInMonth = new Date(year, month, 0).getDate()
  // 获取上个月有多少天
  const daysInPrevMonth = new Date(year, month - 1, 0).getDate()
  
  const days = []
  
  // 添加上个月的日期（灰色显示）
  for (let i = firstDay - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i
    const date = new Date(year, month - 2, day)
    const dateStr = date.toISOString().split('T')[0]
    days.push({
      day,
      date: dateStr,
      hasMessage: searchHistoryDates.value.includes(dateStr),
      selected: selectedDate.value === dateStr,
      otherMonth: true
    })
  }
  
  // 添加本月的日期
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    days.push({
      day,
      date: dateStr,
      hasMessage: searchHistoryDates.value.includes(dateStr),
      selected: selectedDate.value === dateStr,
      otherMonth: false
    })
  }
  
  // 添加下个月的日期（补齐到42个，6行）
  const remainingDays = 42 - days.length
  for (let day = 1; day <= remainingDays; day++) {
    const date = new Date(year, month, day)
    const dateStr = date.toISOString().split('T')[0]
    days.push({
      day,
      date: dateStr,
      hasMessage: searchHistoryDates.value.includes(dateStr),
      selected: selectedDate.value === dateStr,
      otherMonth: true
    })
  }
  
  calendarDays.value = days
}

// 计算可用的年份列表（从当前年份往前推10年，往后推1年）
const availableYears = computed(() => {
  const currentYear = new Date().getFullYear()
  const years = []
  for (let i = currentYear - 10; i <= currentYear + 1; i++) {
    years.push(i)
  }
  return years
})

// 改变月份
const changeDateMonth = (delta) => {
  selectedMonth.value += delta
  if (selectedMonth.value > 12) {
    selectedMonth.value = 1
    selectedYear.value += 1
  } else if (selectedMonth.value < 1) {
    selectedMonth.value = 12
    selectedYear.value -= 1
  }
  loadDatePicker()
  updateDatePickerPosition()
}

// 选择日期
const selectDate = (day) => {
  // 只能选择有消息的日期
  if (day.otherMonth || !day.hasMessage) return
  
  if (selectedDate.value === day.date) {
    // 如果点击已选中的日期，取消选择
    selectedDate.value = null
  } else {
    selectedDate.value = day.date
  }
  
  loadDatePicker()
  loadSearchHistory()
}

// 判断是否为图片文件
const isImageFile = (fileName) => {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico']
  const lowerFileName = fileName.toLowerCase()
  return imageExtensions.some(ext => lowerFileName.endsWith(ext))
}

// 下载文件
const downloadFile = async (path, msgType = null) => {
  try {
    const fileUrl = getImageUrl(path)
    const fileName = getFileName(path) || 'file'
    
    // 判断文件类型：优先使用传入的 msgType，否则根据文件扩展名判断
    const isImage = msgType === 'image' || (msgType !== 'file' && isImageFile(fileName))
    
    // 如果在 Electron 环境中，使用 Electron 的下载 API
    if (window.electronAPI?.downloadFile) {
      // 获取 token（如果需要认证）
      const token = localStorage.getItem('token') || ''
      
      const result = await window.electronAPI.downloadFile({
        url: fileUrl,
        fileName: fileName,
        isImage: isImage,
        token: token
      })
      
      if (result.success) {
        showToast(isImage ? '图片保存成功' : '文件保存成功', 'success')
      } else {
        if (result.message !== '用户取消下载') {
          showToast(result.message || '下载失败', 'error')
        }
      }
      return
    }
    
    // 非 Electron 环境，使用浏览器方式下载
    // 获取 token（如果需要认证）
    const token = localStorage.getItem('token') || ''
    const headers = {}
    if (token) {
      headers['Authorization'] = token
    }
    
    // 使用 fetch 下载文件
    const response = await fetch(fileUrl, {
      method: 'GET',
      headers: headers
    })
    
    if (!response.ok) {
      throw new Error(`下载失败: ${response.status} ${response.statusText}`)
    }
    
    // 创建 blob
    const blob = await response.blob()
    
    // 创建一个临时的a标签来触发下载
    const link = document.createElement('a')
    
    // 使用 blob URL，但设置合适的下载文件名
    const blobUrl = window.URL.createObjectURL(blob)
    link.href = blobUrl
    link.download = fileName
    
    // 设置 title 属性（虽然浏览器可能不使用，但有助于可访问性）
    link.title = isImage ? '保存图片' : '保存文件'
    
    // 添加到 DOM 并触发点击
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    // 延迟释放 blob URL，确保下载已开始
    setTimeout(() => {
      window.URL.revokeObjectURL(blobUrl)
    }, 100)
  } catch (error) {
    console.error('下载文件失败:', error)
    showToast('下载文件失败，请稍后重试', 'error')
  }
}

// 处理回车键：Shift+Enter 换行，Enter 发送
const handleEnterKey = (e) => {
  // 如果@选择器打开，按Enter选择当前项
  if (showMentionPicker.value) {
    e.preventDefault()
    if (mentionPickerItems.value[mentionPickerSelectedIndex.value]) {
      selectMention(mentionPickerItems.value[mentionPickerSelectedIndex.value])
    }
    return
  }
  
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

// 处理输入框按键事件
const handleInputKeydown = (e) => {
  // 如果@选择器打开，处理上下箭头键
  if (showMentionPicker.value) {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      mentionPickerSelectedIndex.value = Math.max(0, mentionPickerSelectedIndex.value - 1)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      mentionPickerSelectedIndex.value = Math.min(mentionPickerItems.value.length - 1, mentionPickerSelectedIndex.value + 1)
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      showMentionPicker.value = false
      return
    }
  }
  
  // 处理Backspace删除@
  if (e.key === 'Backspace' && messageInputRef.value) {
    const cursorPos = messageInputRef.value.selectionStart
    const text = inputMessage.value
    // 检查是否在删除@xxx
    if (cursorPos > 0) {
      const beforeCursor = text.substring(0, cursorPos)
      // 匹配@xxx或@所有人（作为一个整体）
      const match = beforeCursor.match(/(@[^@\s]+|@所有人)$/)
      if (match) {
        e.preventDefault()
        const start = cursorPos - match[0].length
        inputMessage.value = text.substring(0, start) + text.substring(cursorPos)
        nextTick(() => {
          messageInputRef.value.selectionStart = start
          messageInputRef.value.selectionEnd = start
        })
        return
      }
    }
  }
}

// 处理输入框内容变化
const handleInputChange = () => {
  autoResize()
  
  // 只在群聊中启用@功能
  if (currentChatInfo.value?.type !== 'group') {
    showMentionPicker.value = false
    return
  }
  
  if (!messageInputRef.value) return
  
  const cursorPos = messageInputRef.value.selectionStart
  const text = inputMessage.value
  
  // 检查光标前是否有@符号
  const beforeCursor = text.substring(0, cursorPos)
  const atIndex = beforeCursor.lastIndexOf('@')
  
  if (atIndex >= 0) {
    // 检查@后面是否有空格或另一个@，如果有则关闭选择器
    const afterAt = beforeCursor.substring(atIndex + 1)
    if (afterAt.includes(' ') || afterAt.includes('@')) {
      showMentionPicker.value = false
      return
    }
    
    // 显示@选择器
    mentionStartPos.value = atIndex
    const keyword = afterAt.toLowerCase()
    
    // 构建选择器列表
    const items = []
    
    // 第一项：@所有人
    if ('所有人'.includes(keyword) || 'all'.includes(keyword) || keyword === '') {
      items.push({
        type: 'all',
        displayName: '所有人'
      })
    }
    
    // 群成员列表
    groupMembers.value.forEach(member => {
      if (member.user_id === props.user.id) return // 排除自己
      const displayName = getMemberDisplayName(member)
      if (displayName.toLowerCase().includes(keyword) || keyword === '') {
        items.push({
          type: 'user',
          user_id: member.user_id,
          displayName: displayName,
          avatar: member.avatar
        })
      }
    })
    
    mentionPickerItems.value = items
    mentionPickerSelectedIndex.value = 0
    
    if (items.length > 0) {
      showMentionPicker.value = true
      // 计算选择器位置
      updateMentionPickerPosition()
    } else {
      showMentionPicker.value = false
    }
  } else {
    showMentionPicker.value = false
  }
}
// 更新@选择器位置
const updateMentionPickerPosition = () => {
  if (!messageInputRef.value) return
  
  nextTick(() => {
    const rect = messageInputRef.value.getBoundingClientRect()
    const inputWrapper = messageInputRef.value.closest('.input-wrapper')
    if (inputWrapper) {
      const wrapperRect = inputWrapper.getBoundingClientRect()
      mentionPickerStyle.value = {
        top: `${rect.top - wrapperRect.top - 200}px`,
        left: '0px'
      }
    }
  })
}

// 选择@项
const selectMention = (item) => {
  if (!messageInputRef.value) return
  
  const text = inputMessage.value
  const beforeAt = text.substring(0, mentionStartPos.value)
  const afterCursor = text.substring(messageInputRef.value.selectionStart)
  
  let mentionText = ''
  if (item.type === 'all') {
    mentionText = '@所有人'
  } else {
    mentionText = `@${item.displayName}`
  }
  
  inputMessage.value = beforeAt + mentionText + ' ' + afterCursor
  
  showMentionPicker.value = false
  
  // 设置光标位置
  nextTick(() => {
    const newPos = beforeAt.length + mentionText.length + 1
    messageInputRef.value.selectionStart = newPos
    messageInputRef.value.selectionEnd = newPos
    messageInputRef.value.focus()
    autoResize()
  })
}

// 自动调整 textarea 高度
const autoResize = () => {
  if (messageInputRef.value) {
    messageInputRef.value.style.height = 'auto'
    const maxHeight = 200 // 最大高度限制
    const newHeight = Math.min(messageInputRef.value.scrollHeight, maxHeight)
    messageInputRef.value.style.height = newHeight + 'px'
    messageInputRef.value.style.overflowY = newHeight >= maxHeight ? 'auto' : 'hidden'
  }
}

// 表情包功能
const emojiCategories = [
  { name: 'smileys', icon: '😊', emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '☺️', '😚', '😙', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '😵', '😵‍💫', '🤯', '🤠', '🥳', '😎', '🤓', '🧐'] },
  { name: 'gestures', icon: '👍', emojis: ['👋', '🤚', '🖐', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '👀', '👁️', '👅', '👄'] },
  { name: 'animals', icon: '🐶', emojis: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐽', '🐸', '🐵', '🙈', '🙉', '🙊', '🐒', '🐔', '🐧', '🐦', '🐤', '🐣', '🐥', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦟', '🦗', '🕷️', '🦂', '🐢', '🐍', '🦎', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🦧', '🐘', '🦛', '🦏', '🐪', '🐫', '🦒', '🦘', '🐃', '🐂', '🐄', '🐎', '🐖', '🐏', '🐑', '🦙', '🐐', '🦌', '🐕', '🐩', '🦮', '🐈', '🦃', '🦚', '🦜', '🦢', '🦩', '🕊️', '🐇', '🦝', '🦨', '🦡', '🦫', '🦦', '🦥', '🐁', '🐀', '🐿️', '🦔'] },
  { name: 'food', icon: '🍎', emojis: ['🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶️', '🌽', '🥕', '🥔', '🍠', '🥐', '🥯', '🍞', '🥖', '🥨', '🧀', '🥚', '🍳', '🥞', '🥓', '🥩', '🥟', '🍕', '🍔', '🍟', '🌭', '🍿', '🧂', '🥘', '🍲', '🥣', '🥗', '🍿', '🧈', '🧇', '🥞', '🥯', '🥖', '🥨', '🧀', '🥚', '🍳', '🥞', '🥓', '🥩', '🥟', '🍕', '🍔', '🍟', '🌭', '🍿', '🧂'] },
  { name: 'symbols', icon: '❤️', emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓', '🆔', '⚛️', '🉑', '☢️', '☣️', '📴', '📳', '🈶', '🈚', '🈸', '🈺', '🈷️', '✴️', '🆚', '💮', '🉐', '㊙️', '㊗️', '🈴', '🈵', '🈹', '🈲', '🅰️', '🅱️', '🆎', '🆑', '🅾️', '🆘', '❌', '⭕', '🛑', '⛔', '📛', '🚫', '💯', '💢', '♨️', '🚷', '🚯', '🚳', '🚱', '🔞', '📵', '🚭', '❗', '❓', '❕', '❔', '‼️', '⁉️', '🔅', '🔆', '〽️', '⚠️', '🚸', '🔱', '⚜️', '🔰', '♻️', '✅', '🈯', '💹', '❇️', '✳️', '❎', '🌐', '💠', 'Ⓜ️', '🌀', '💤', '🏧', '🚾', '♿', '🅿️', '🈳', '🈂️', '🛂', '🛃', '🛄', '🛅', '🚹', '🚺', '🚼', '🚻', '🚮', '🎦', '📶', '🈁', '🔣', 'ℹ️', '🔤', '🔡', '🔠', '🆖', '🆗', '🆙', '🆒', '🆕', '🆓', '0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '🔢', '#️⃣', '*️⃣', '▶️', '⏸️', '⏯️', '⏹️', '⏺️', '⏏️'] }
]

const toggleEmojiPicker = () => {
  if (isGroupDisbanded.value) {
    showToast('无法在已解散的群聊中发送消息', 'error')
    return
  }
  showEmojiPicker.value = !showEmojiPicker.value
}

const getCurrentCategoryEmojis = () => {
  const category = emojiCategories.find(c => c.name === currentEmojiCategory.value)
  return category ? category.emojis : []
}

const insertEmoji = (emoji) => {
  if (messageInputRef.value) {
    const textarea = messageInputRef.value
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const text = inputMessage.value
    const before = text.substring(0, start)
    const after = text.substring(end)
    
    inputMessage.value = before + emoji + after
    
    // 设置光标位置
    nextTick(() => {
      textarea.focus()
      const newPosition = start + emoji.length
      textarea.setSelectionRange(newPosition, newPosition)
      autoResize()
    })
  } else {
    inputMessage.value += emoji
    nextTick(() => {
      autoResize()
    })
  }
  
  // 插入表情后关闭表情选择器
  showEmojiPicker.value = false
}

const scrollToBottom = () => {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

const getImageUrl = (path) => {
  // 使用与API请求相同的地址
  const apiUrl = getApiBaseUrl() || 'http://localhost:3000'
  // 处理URL拼接，避免双斜杠
  const baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl
  const imagePath = path.startsWith('/') ? path : `/${path}`
  return `${baseUrl}${imagePath}`
}

// 获取免打扰图标路径（已改为使用响应式变量）
const getMuteIconPath = () => {
  return muteIconPath.value
}

const getFileName = (path) => {
  if (!path) return '文件'
  const parts = path.split('/')
  return parts[parts.length - 1]
}

// 获取消息头像，如果是自己发送的消息，使用当前用户的头像
const getMessageAvatarStyle = (msg) => {
  // AI好友的消息：在AI好友聊天中，如果sender_id不是当前用户，就是AI消息
  // 或者消息的nickname是'AI好友'，或者sender_id是0
  if (isAIFriendChat.value && msg.sender_id !== props.user.id) {
    return 'AI_FRIEND_AVATAR'
  }
  if (msg.sender_id === 0 || msg.nickname === 'AI好友') {
    return 'AI_FRIEND_AVATAR'
  }
  if (msg.sender_id === props.user.id) {
    // 如果是自己发送的消息，使用当前用户的头像
    return props.user.avatar || msg.avatar
  }
  // 其他人的消息，使用消息中的头像
  return msg.avatar
}

const previewImage = async (path) => {
  const clickedUrl = getImageUrl(path)
  // 收集当前聊天窗口中的所有图片消息，按展示顺序
  const imageUrls = messages.value
    .filter(msg => msg.type === 'image' && msg.content)
    .map(msg => getImageUrl(msg.content))
  // 定位当前索引
  let index = imageUrls.findIndex(u => u === clickedUrl)
  if (index < 0) {
    // 若未命中（例如历史消息未加载完全），将当前图片置于数组首位
    imageUrls.unshift(clickedUrl)
    index = 0
  }
  
  // 如果在 Electron 环境中，使用 Electron API 打开带列表与索引的预览窗口
  if (window.electronAPI?.openImagePreview) {
    try {
      await window.electronAPI.openImagePreview({ images: imageUrls, index })
    } catch (e) {
      console.error('打开图片预览窗口失败:', e)
      // 如果 Electron API 失败，回退到浏览器方式
      window.open(clickedUrl, '_blank')
    }
  } else {
    // 非 Electron 环境，使用浏览器方式
    window.open(clickedUrl, '_blank')
  }
}

// 预览头像（单张图片，不显示左右切换按钮）
const previewAvatar = async (avatarPath) => {
  if (!avatarPath) return
  const avatarUrl = getImageUrl(avatarPath)
  
  // 如果在 Electron 环境中，使用 Electron API 打开头像预览窗口（只传一张图片）
  if (window.electronAPI?.openImagePreview) {
    try {
      // 传递只包含一张图片的数组
      await window.electronAPI.openImagePreview({ images: [avatarUrl], index: 0 })
    } catch (e) {
      console.error('打开头像预览窗口失败:', e)
      // 如果 Electron API 失败，回退到浏览器方式
      window.open(avatarUrl, '_blank')
    }
  } else {
    // 非 Electron 环境，使用浏览器方式
    window.open(avatarUrl, '_blank')
  }
}

// 头像上传功能
const selectAvatar = () => {
  avatarInput.value?.click()
}

const handleAvatarSelect = async (event) => {
  const file = event.target.files[0]
  if (!file) return
  
  // 验证文件类型
  if (!file.type.startsWith('image/')) {
    showToast('请选择图片文件', 'error')
    if (avatarInput.value) {
      avatarInput.value.value = ''
    }
    return
  }
  
  // 验证文件大小（限制为5MB）
  if (file.size > 5 * 1024 * 1024) {
    showToast('图片大小不能超过5MB', 'error')
    if (avatarInput.value) {
      avatarInput.value.value = ''
    }
    return
  }
  
  // 读取文件并显示裁剪对话框
  const reader = new FileReader()
  reader.onload = (e) => {
    cropperImageSrc.value = e.target.result
    showCropper.value = true
  }
  reader.readAsDataURL(file)
}

// 裁剪确认
const handleCropConfirm = async (croppedFile) => {
  showCropper.value = false
  cropperImageSrc.value = ''
  
  try {
    const data = await auth.updateAvatar(croppedFile)
    if (data.code === 200) {
      // 更新本地用户信息
      const updatedUser = {
        ...props.user,
        avatar: data.data.avatar || data.data.user?.avatar
      }
      emits('update-user', updatedUser)
      
      // 更新当前消息列表中的头像（只更新自己发送的消息）
      messages.value = messages.value.map(msg => {
        // 系统通知不更新头像
        if (isSystemMessage(msg)) {
          return msg
        }
        if (msg.sender_id === props.user.id) {
          return {
            ...msg,
            avatar: updatedUser.avatar
          }
        }
        return msg
      })
      
      showToast('头像更新成功', 'success')
    } else {
      showToast('头像更新失败: ' + (data.message || '未知错误'), 'error')
    }
  } catch (e) {
    console.error('更新头像失败:', e)
    showToast('头像更新失败，请重试', 'error')
  } finally {
    // 清空文件输入，允许重复选择同一文件
    if (avatarInput.value) {
      avatarInput.value.value = ''
    }
  }
}

// 裁剪取消
const handleCropCancel = () => {
  showCropper.value = false
  cropperImageSrc.value = ''
  // 清空文件输入
  if (avatarInput.value) {
    avatarInput.value.value = ''
  }
}

// 修改昵称功能
const openNicknameDialog = () => {
  editingNickname.value = props.user.name || props.user.username || ''
  showNicknameDialog.value = true
  nextTick(() => {
    if (nicknameInputRef.value) {
      nicknameInputRef.value.focus()
      nicknameInputRef.value.select()
    }
  })
}

const closeNicknameDialog = () => {
  // 释放输入框焦点
  if (nicknameInputRef.value) {
    nicknameInputRef.value.blur()
  }
  editingNickname.value = ''
  showNicknameDialog.value = false
  // 延迟确保DOM更新完成并释放焦点
  setTimeout(() => {
    // 强制释放所有输入框焦点
    const inputs = document.querySelectorAll('input, textarea')
    inputs.forEach(input => {
      if (document.activeElement === input) {
        input.blur()
      }
    })
    // 让 body 获得焦点
    if (document.body) {
      document.body.focus()
    }
  }, 50)
}

const saveNickname = async () => {
  const newName = editingNickname.value.trim()
  if (!newName) {
    showToast('昵称不能为空', 'error')
    return
  }
  
  if (newName === (props.user.name || props.user.username)) {
    // 没有变化，直接关闭对话框
    closeNicknameDialog()
    return
  }
  
  try {
    const data = await auth.updateNickname(newName)
    if (data.code === 200) {
      // 更新本地用户信息
      const updatedUser = {
        ...props.user,
        name: data.data.user?.name || data.data.name || newName
      }
      emits('update-user', updatedUser)
      
      // 更新消息列表中的昵称（只更新自己发送的消息）
      messages.value = messages.value.map(msg => {
        // 系统通知不更新昵称
        if (isSystemMessage(msg)) {
          return msg
        }
        if (msg.sender_id === props.user.id) {
          return {
            ...msg,
            nickname: updatedUser.name || updatedUser.username
          }
        }
        return msg
      })
      
      // 释放输入框焦点
      if (nicknameInputRef.value) {
        nicknameInputRef.value.blur()
      }
      closeNicknameDialog()
      // 使用 Toast 消息提示，不阻塞，不会导致焦点问题
      showToast('昵称更新成功', 'success')
    } else {
      showToast('昵称更新失败: ' + (data.message || '未知错误'), 'error')
    }
  } catch (e) {
    console.error('更新昵称失败:', e)
    showToast('昵称更新失败，请重试', 'error')
  }
}

// 修改用户名功能
const openUsernameDialog = () => {
  editingUsername.value = props.user.username || ''
  usernamePassword.value = ''
  usernameError.value = ''
  usernameExistsError.value = ''
  usernamePasswordError.value = ''
  showUsernameDialog.value = true
  nextTick(() => {
    if (usernameInputRef.value) {
      usernameInputRef.value.focus()
      usernameInputRef.value.select()
    }
  })
}

const closeUsernameDialog = () => {
  // 释放输入框焦点
  if (usernameInputRef.value) {
    usernameInputRef.value.blur()
  }
  if (usernamePasswordInputRef.value) {
    usernamePasswordInputRef.value.blur()
  }
  editingUsername.value = ''
  usernamePassword.value = ''
  usernameError.value = ''
  usernameExistsError.value = ''
  usernamePasswordError.value = ''
  showUsernameDialog.value = false
  // 延迟确保DOM更新完成并释放焦点
  setTimeout(() => {
    // 强制释放所有输入框焦点
    const inputs = document.querySelectorAll('input, textarea')
    inputs.forEach(input => {
      if (document.activeElement === input) {
        input.blur()
      }
    })
    // 让 body 获得焦点
    if (document.body) {
      document.body.focus()
    }
  }, 50)
}

// 用户名格式验证
const validateUsername = () => {
  usernameError.value = ''
  usernameExistsError.value = ''
  
  const username = editingUsername.value.trim()
  
  if (!username) {
    return // 空值时不显示错误
  }
  
  // 检查长度
  if (username.length < 6 || username.length > 20) {
    usernameError.value = '用户名长度必须在6-20个字符之间'
    return
  }
  
  // 检查是否包含特殊字符（只允许字母和数字）
  if (!/^[a-zA-Z0-9]+$/.test(username)) {
    usernameError.value = '用户名只能包含字母和数字，不能有特殊字符'
    return
  }
  
  // 如果和当前用户名相同，显示错误
  if (username === props.user.username) {
    usernameError.value = '新用户名不能与当前用户名相同'
    return
  }
}

// 检查用户名是否已存在
const checkUsernameExists = async () => {
  const username = editingUsername.value.trim()
  if (!username || username === props.user.username) {
    usernameExistsError.value = ''
    return false
  }
  
  try {
    // 使用搜索用户接口检查用户名是否存在
    const data = await friend.search(username)
    if (data.code === 200 && data.data) {
      // 检查搜索结果中是否有完全匹配的用户名
      const exists = data.data.some((user) => user.username === username)
      if (exists) {
        usernameExistsError.value = '该用户名已存在，请使用其他用户名'
        return true // 存在
      } else {
        usernameExistsError.value = ''
        return false // 不存在
      }
    } else {
      usernameExistsError.value = ''
      return false
    }
  } catch (e) {
    console.error('检查用户名失败:', e)
    // 检查失败时返回false，让用户尝试提交
    usernameExistsError.value = ''
    return false
  }
}

// 忘记密码时的密码验证
const validateNewPasswordForUsername = () => {
  if (!usernameNewPassword.value) {
    return ''
  }
  
  // 检查长度
  if (usernameNewPassword.value.length < 8 || usernameNewPassword.value.length > 16) {
    return '密码长度必须在8-16位之间'
  }
  
  // 检查是否是纯数字
  if (/^\d+$/.test(usernameNewPassword.value)) {
    return '密码不能是纯数字'
  }
  
  // 检查是否包含英文字母
  if (!/[a-zA-Z]/.test(usernameNewPassword.value)) {
    return '密码必须包含英文字母'
  }
  
  // 检查是否包含数字
  if (!/\d/.test(usernameNewPassword.value)) {
    return '密码必须包含数字'
  }
  
  return ''
}

// 发送忘记密码验证码
const sendUsernameForgetCode = async () => {
  if (!usernameForgetEmail.value) {
    showToast('请先输入邮箱', 'error')
    return
  }
  
  usernameCodeSending.value = true
  try {
    const data = await auth.sendCode(usernameForgetEmail.value)
    if (data.code === 200) {
      showToast('验证码已发送，请查收邮件', 'success')
      // 开始倒计时（60秒）
      usernameCountdown.value = 60
      usernameCountdownTimer = setInterval(() => {
        usernameCountdown.value--
        if (usernameCountdown.value <= 0) {
          clearInterval(usernameCountdownTimer)
          usernameCountdownTimer = null
        }
      }, 1000)
    } else {
      showToast(data.message || '发送验证码失败', 'error')
    }
  } catch (e) {
    showToast('发送验证码失败: ' + e.message, 'error')
  } finally {
    usernameCodeSending.value = false
  }
}

// 忘记密码
const onUsernameForgetPassword = async () => {
  if (!usernameForgetEmail.value || !usernameForgetCode.value || !usernameNewPassword.value) {
    showToast('请填写完整信息', 'error')
    return
  }
  
  // 验证新密码格式
  const passwordValidationError = validateNewPasswordForUsername()
  if (passwordValidationError) {
    usernameForgetPasswordError.value = passwordValidationError
    showToast(passwordValidationError, 'error')
    return
  }
  
  try {
    const data = await auth.forgetPassword(usernameForgetEmail.value, usernameForgetCode.value, usernameNewPassword.value)
    if (data.code === 200) {
      showToast('密码重置成功，请使用新密码', 'success')
      showUsernameForgetPassword.value = false
      // 更新密码输入框
      usernamePassword.value = usernameNewPassword.value
      usernameForgetEmail.value = ''
      usernameForgetCode.value = ''
      usernameNewPassword.value = ''
      usernameForgetPasswordError.value = ''
    } else {
      showToast(data.message || '密码重置失败', 'error')
    }
  } catch (e) {
    showToast('密码重置失败: ' + e.message, 'error')
  }
}

// 保存用户名
const saveUsername = async () => {
  // 先验证格式
  validateUsername()
  if (usernameError.value) {
    return
  }
  
  const newUsername = editingUsername.value.trim()
  if (!newUsername || !usernamePassword.value) {
    showToast('请填写完整信息', 'error')
    return
  }
  
  if (newUsername === props.user.username) {
    showToast('新用户名不能与当前用户名相同', 'error')
    return
  }
  
  // 检查用户名是否已存在
  const exists = await checkUsernameExists()
  if (exists) {
    // 用户名已存在，提示用户重新输入
    showToast('该用户名已存在，请使用其他用户名', 'error')
    // 聚焦到用户名输入框，让用户重新输入
    nextTick(() => {
      if (usernameInputRef.value) {
        usernameInputRef.value.focus()
        usernameInputRef.value.select()
      }
    })
    return
  }
  
  try {
    const data = await auth.updateUsername(newUsername, usernamePassword.value)
    if (data.code === 200) {
      // 更新本地用户信息
      const updatedUser = {
        ...props.user,
        username: newUsername
      }
      emits('update-user', updatedUser)
      
      closeUsernameDialog()
      showToast('用户名更新成功', 'success')
    } else {
      if (data.code === 4000) {
        usernamePasswordError.value = '密码错误'
        showToast('密码错误，请重新输入', 'error')
      } else {
        showToast(data.message || '用户名更新失败', 'error')
      }
    }
  } catch (e) {
    console.error('更新用户名失败:', e)
    showToast('用户名更新失败，请重试', 'error')
  }
}

// 显示用户信息
const showUserInfo = async (userId, avatar, nickname, options = {}) => {
  try {
    selectedFriendRequest.value = options.request || null
    selectedFriendRequestIsIncoming.value = !!options.isIncoming
    
    // 判断是否是AI好友：userId === 0 或者在AI好友聊天中且不是当前用户
    const isAIFriend = userId === 0 || (isAIFriendChat.value && userId !== props.user.id && nickname === 'AI好友')
    
    // 先使用消息中的信息作为临时显示
    selectedUserInfo.value = {
      id: userId,
      username: '',
      name: nickname || '',
      avatar: avatar || '',
      remark: '',
      email: '',
      is_friend: false,
      is_blocked: 0,
      group_nickname: null,
      isAIFriend: isAIFriend
    }
    showUserInfoDialog.value = true
    
    // 如果是AI好友，获取AI好友信息
    if (isAIFriend) {
      try {
        const aiFriendData = await aiFriend.get()
        if (aiFriendData.code === 200 && aiFriendData.data) {
          selectedUserInfo.value = {
            id: userId,
            username: 'ai_friend_system',
            name: aiFriendData.data.ai_name || 'AI好友',
            avatar: '',
            email: '',
            remark: '',
            is_friend: false,
            is_blocked: 0,
            group_nickname: null,
            isAIFriend: true,
            friend_type: aiFriendData.data.friend_type,
            friend_type_name: aiFriendData.data.friend_type_name,
            user_nickname: aiFriendData.data.user_nickname,
            ai_name: aiFriendData.data.ai_name
          }
          selectedAIFriendType.value = aiFriendData.data.friend_type
        } else {
          selectedUserInfo.value = {
            id: userId,
            username: 'ai_friend_system',
            name: 'AI好友',
            avatar: '',
            email: '',
            remark: '',
            is_friend: false,
            is_blocked: 0,
            group_nickname: null,
            isAIFriend: true,
            friend_type: 'warm',
            friend_type_name: '温暖倾听型',
            user_nickname: null,
            ai_name: null
          }
          selectedAIFriendType.value = 'warm'
        }
      } catch (e) {
        console.error('获取AI好友信息失败:', e)
        selectedUserInfo.value = {
          id: userId,
          username: 'ai_friend_system',
          name: 'AI好友',
          avatar: '',
          email: '',
          remark: '',
          is_friend: false,
          is_blocked: 0,
          group_nickname: null,
          isAIFriend: true,
          friend_type: 'warm',
          friend_type_name: '温暖倾听型',
          user_nickname: null,
          ai_name: null
        }
        selectedAIFriendType.value = 'warm'
      }
      return
    }
    
    // 如果是群聊，获取该用户在群中的群聊昵称
    let groupNickname = null
    if (currentChatInfo.value?.type === 'group' && groupMembers.value.length > 0) {
      const member = groupMembers.value.find(m => m.user_id === userId)
      if (member && member.group_nickname && member.group_nickname !== member.name) {
        groupNickname = member.group_nickname
      }
    }
    
    // 异步获取完整的用户信息（包括备注和邮箱）
    const data = await friend.getUserInfo(userId)
    if (data.code === 200 && data.data) {
      // 处理备注：如果备注为空字符串或等于用户名，则视为未设置备注
      const remark = data.data.remark && data.data.remark.trim() && data.data.remark !== data.data.username ? data.data.remark : ''
      selectedUserInfo.value = {
        id: data.data.id,
        username: data.data.username || '',
        name: data.data.name || data.data.username || '',
        avatar: data.data.avatar || '',
        email: data.data.email || '',
        remark: remark,
        signature: data.data.signature || '',
        interests: data.data.interests || '',
        is_friend: data.data.is_friend || false,
        is_blocked: data.data.is_blocked || 0,
        group_nickname: groupNickname,
        isAIFriend: false
      }
      // 处理interests字段：如果是JSON数组字符串，转换为逗号分隔字符串用于显示
      if (selectedUserInfo.value.interests && typeof selectedUserInfo.value.interests === 'string') {
        try {
          const parsed = JSON.parse(selectedUserInfo.value.interests)
          if (Array.isArray(parsed)) {
            selectedUserInfo.value.interests = parsed.join(',')
          }
        } catch (e) {
          // 不是JSON格式，保持原样（已经是逗号分隔字符串）
        }
      }
    } else {
      // 即使获取用户信息失败，也设置群聊昵称
      selectedUserInfo.value.group_nickname = groupNickname
    }
    // 如果请求来源不是好友申请，保持 selectedFriendRequest 为 null
    if (!options.request) {
      selectedFriendRequest.value = null
      selectedFriendRequestIsIncoming.value = false
    }
  } catch (e) {
    console.error('获取用户信息失败:', e)
    // 即使获取失败，也显示已有的信息
    showUserInfoDialog.value = true
  }
}

const closeUserInfoDialog = () => {
  // 释放输入框焦点
  if (remarkInputRef.value) {
    remarkInputRef.value.blur()
  }
  isEditingRemark.value = false
  editingRemark.value = ''
  selectedFriendRequest.value = null
  selectedFriendRequestIsIncoming.value = false
  selectedUserInfo.value = { id: null, username: '', name: '', avatar: '', email: '', remark: '', is_friend: false, is_blocked: 0 }
  showUserInfoDialog.value = false
  // 如果在右侧面板显示，则切换回聊天视图
  if (rightPanelView.value === 'userInfo') {
    rightPanelView.value = 'chat'
  }
  // 延迟确保DOM更新完成并释放焦点
  setTimeout(() => {
    // 强制释放所有输入框焦点
    const inputs = document.querySelectorAll('input, textarea')
    inputs.forEach(input => {
      if (document.activeElement === input) {
        input.blur()
      }
    })
    // 让 body 获得焦点
    if (document.body) {
      document.body.focus()
    }
  }, 50)
}

// 备注编辑功能
const startEditRemark = () => {
  editingRemark.value = selectedUserInfo.value.remark || ''
  isEditingRemark.value = true
  nextTick(() => {
    if (remarkInputRef.value) {
      remarkInputRef.value.focus()
      remarkInputRef.value.select()
    }
  })
}

const saveRemark = async () => {
  const newRemark = editingRemark.value.trim()
  if (!selectedUserInfo.value.id) {
    return
  }
  
  // 释放输入框焦点
  if (remarkInputRef.value) {
    remarkInputRef.value.blur()
  }
  
  try {
    const data = await friend.updateRemark(selectedUserInfo.value.id, newRemark)
    if (data.code === 200) {
      selectedUserInfo.value.remark = newRemark
      isEditingRemark.value = false
      editingRemark.value = ''
      // 刷新好友列表和聊天列表，以便显示更新后的备注
      await loadFriendList()
      await loadChatList()
      
      // 如果当前打开的聊天对象是被修改备注的用户，更新聊天框顶部的名称
      // 从更新后的聊天列表中查找对应的聊天项（通过 room 匹配）
      if (currentRoom.value && currentChatInfo.value) {
        const updatedChat = chatList.value.find(item => item.room === currentRoom.value)
        if (updatedChat) {
          // 检查是否是私聊且用户ID匹配
          const isPrivateChat = updatedChat.chat_type === 'private' || (!updatedChat.group_id && updatedChat.user_id)
          if (isPrivateChat && updatedChat.user_id === selectedUserInfo.value.id) {
            currentChatInfo.value = {
              ...currentChatInfo.value,
              name: updatedChat.remark || updatedChat.name || updatedChat.username || '聊天'
            }
          }
        }
      }
      
      showToast('备注更新成功', 'success')
    } else {
      showToast('备注更新失败: ' + (data.message || '未知错误'), 'error')
    }
  } catch (e) {
    console.error('更新备注失败:', e)
    showToast('备注更新失败，请重试', 'error')
  }
}
const cancelEditRemark = () => {
  // 释放输入框焦点
  if (remarkInputRef.value) {
    remarkInputRef.value.blur()
  }
  isEditingRemark.value = false
  editingRemark.value = ''
  // 延迟确保焦点已释放
  setTimeout(() => {
    // 强制释放所有输入框焦点
    const inputs = document.querySelectorAll('input, textarea')
    inputs.forEach(input => {
      if (document.activeElement === input) {
        input.blur()
      }
    })
    // 让 body 获得焦点
    if (document.body) {
      document.body.focus()
    }
  }, 50)
}

// AI好友设置相关函数
const startEditUserNickname = () => {
  isEditingUserNickname.value = true
  editingUserNickname.value = selectedUserInfo.value.user_nickname || ''
  nextTick(() => {
    if (userNicknameInputRef.value) {
      userNicknameInputRef.value.focus()
    }
  })
}

const cancelEditUserNickname = () => {
  isEditingUserNickname.value = false
  editingUserNickname.value = ''
}

const saveUserNickname = async () => {
  const newNickname = editingUserNickname.value.trim()
  try {
    const data = await aiFriend.updateSettings(newNickname || null, selectedUserInfo.value.ai_name || null)
    if (data.code === 200) {
      selectedUserInfo.value.user_nickname = newNickname || null
      isEditingUserNickname.value = false
      editingUserNickname.value = ''
      showToast('用户昵称更新成功', 'success')
    } else {
      showToast(data.message || '更新失败', 'error')
    }
  } catch (e) {
    console.error('更新用户昵称失败:', e)
    showToast('更新失败，请重试', 'error')
  }
}

const startEditAIName = () => {
  isEditingAIName.value = true
  editingAIName.value = selectedUserInfo.value.ai_name || ''
  nextTick(() => {
    if (aiNameInputRef.value) {
      aiNameInputRef.value.focus()
    }
  })
}

const cancelEditAIName = () => {
  isEditingAIName.value = false
  editingAIName.value = ''
}

const saveAIName = async () => {
  const newAIName = editingAIName.value.trim()
  try {
    const data = await aiFriend.updateSettings(selectedUserInfo.value.user_nickname || null, newAIName || null)
    if (data.code === 200) {
      selectedUserInfo.value.ai_name = newAIName || null
      selectedUserInfo.value.name = newAIName || 'AI好友'
      isEditingAIName.value = false
      editingAIName.value = ''
      showToast('AI名字更新成功', 'success')
      // 刷新聊天列表
      await loadChatList()
    } else {
      showToast(data.message || '更新失败', 'error')
    }
  } catch (e) {
    console.error('更新AI名字失败:', e)
    showToast('更新失败，请重试', 'error')
  }
}

const switchAIFriendType = async () => {
  if (!selectedAIFriendType.value) return
  try {
    // clear_context = false，不清空聊天记录
    const data = await aiFriend.createOrUpdate(selectedAIFriendType.value, false)
    if (data.code === 200) {
      selectedUserInfo.value.friend_type = selectedAIFriendType.value
      const friendTypeNames = {
        warm: '温暖倾听型',
        humorous: '幽默开朗型',
        rational: '理性分析型',
        energetic: '活力鼓励型'
      }
      selectedUserInfo.value.friend_type_name = friendTypeNames[selectedAIFriendType.value] || '温暖倾听型'
      showToast('人格切换成功', 'success')
      // 如果当前在AI好友聊天中，重新加载消息（AI会主动发送一条消息）
      if (isAIFriendChat.value) {
        // 等待一小段时间确保后端已生成AI消息
        await new Promise(resolve => setTimeout(resolve, 500))
        await loadAIFriendHistory()
        scrollToBottom()
      }
    } else {
      showToast(data.message || '切换失败', 'error')
      // 恢复原值
      selectedAIFriendType.value = selectedUserInfo.value.friend_type || 'warm'
    }
  } catch (e) {
    console.error('切换AI好友人格失败:', e)
    showToast('切换失败，请重试', 'error')
    // 恢复原值
    selectedAIFriendType.value = selectedUserInfo.value.friend_type || 'warm'
  }
}

const confirmClearContext = async () => {
  showClearContextConfirm.value = false
  try {
    const data = await aiFriend.clearContext()
    if (data.code === 200) {
      showToast('上下文已清空', 'success')
      // 如果当前在AI好友聊天中，重新加载消息（AI会主动发送一条消息）
      if (isAIFriendChat.value) {
        // 等待一小段时间确保后端已生成系统提示和AI消息
        await new Promise(resolve => setTimeout(resolve, 500))
        await loadAIFriendHistory()
        scrollToBottom()
      }
    } else {
      showToast(data.message || '清空失败', 'error')
    }
  } catch (e) {
    console.error('清空AI好友上下文失败:', e)
    showToast('清空失败，请重试', 'error')
  }
}

const closeAddFriendDialog = () => {
  // 释放输入框焦点
  if (searchUsernameInputRef.value) {
    searchUsernameInputRef.value.blur()
  }
  if (showFriendRequestModal.value) {
    closeFriendRequestModal()
  }
  searchUsername.value = ''
  searchResults.value = []
  searchError.value = ''
  searchAttempted.value = false
  showAddFriend.value = false
  // 延迟确保DOM更新完成并释放焦点
  setTimeout(() => {
    // 强制释放所有输入框焦点
    const inputs = document.querySelectorAll('input, textarea')
    inputs.forEach(input => {
      if (document.activeElement === input) {
        input.blur()
      }
    })
    // 让 body 获得焦点
    if (document.body) {
      document.body.focus()
    }
  }, 50)
}

const searchUser = async () => {
  const keyword = searchUsername.value.trim()
  if (!keyword) {
    searchResults.value = []
    searchError.value = ''
    searchAttempted.value = false
    return
  }
  searchAttempted.value = true
  searchError.value = ''
  searchResults.value = [] // 清空之前的搜索结果
  try {
    const data = await friend.search(keyword)
    console.log('搜索返回数据:', data)
    if (data.code === 200) {
      searchResults.value = (data.data || []).map(item => {
        // 确保群聊头像路径正确
        if (item.type === 'group' && item.avatar) {
          // 如果avatar是空字符串，设置为null
          if (!item.avatar.trim()) {
            item.avatar = null
          }
        }
        return item
      })
      console.log('搜索结果:', searchResults.value)
      if (searchResults.value.length === 0) {
        // 判断是否是群id搜索
        const isGroupCode = /^\d{8,10}$/.test(keyword)
        if (isGroupCode) {
          searchError.value = '无法找到该群聊，请检查群id是否正确'
        } else {
          searchError.value = '无法找到该用户，请检查你填写的账号是否正确'
        }
      }
      updateSearchResultRequestFlags()
    } else {
      searchResults.value = []
      searchError.value = data.message || '搜索失败，请稍后重试'
      updateSearchResultRequestFlags()
    }
  } catch (e) {
    console.error('搜索用户失败:', e)
    searchResults.value = []
    // 判断是否是群id搜索
    const isGroupCode = /^\d{8,10}$/.test(searchUsername.value.trim())
    if (isGroupCode) {
      searchError.value = '搜索群聊失败，请稍后重试'
    } else {
      searchError.value = '搜索失败，请稍后重试'
    }
    updateSearchResultRequestFlags()
  }
}

// 格式化日期时间
// 格式化消息时间
const formatMessageTime = (timeStr) => {
  if (!timeStr) return ''
  try {
    // 处理ISO格式和已格式化的时间字符串
    const date = new Date(timeStr.replace(/\//g, '-'))
    if (isNaN(date.getTime())) {
      return timeStr
    }
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).replace(/\//g, '/')
  } catch (e) {
    return timeStr
  }
}

const formatDate = (dateString) => {
  if (!dateString) return '-'
  try {
    const date = new Date(dateString)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch (e) {
    return dateString
  }
}

// 加入群聊
const joinGroup = async (groupInfo) => {
  if (!groupInfo || !groupInfo.id) {
    showToast('群聊信息错误', 'error')
    return
  }
  
  try {
    const data = await group.join(groupInfo.id)
    if (data.code === 200) {
      showToast('加入群聊成功', 'success')
      // 关闭添加好友/群聊弹窗
      closeAddFriendDialog()
      // 刷新聊天列表
      await loadChatList()
      // 刷新群聊列表（通讯录）
      await loadGroupChatListForContact()
      // 自动打开该群聊
      const chatItem = chatList.value.find(item => item.group_id === groupInfo.id)
      if (chatItem) {
        await selectChat(chatItem)
      }
    } else {
      showToast(data.message || '加入群聊失败', 'error')
    }
  } catch (e) {
    console.error('加入群聊失败:', e)
    showToast('加入群聊失败，请稍后重试', 'error')
  }
}

const addFriend = (user) => {
  selectedFriendRequestUser.value = user
  const defaultGreeting = props.user.name || props.user.username || '我'
  friendRequestGreeting.value = `你好，我是${defaultGreeting}`
  friendRequestRemark.value = ''
  showFriendRequestModal.value = true
  sendingFriendRequest.value = false
  nextTick(() => {
    if (friendRequestGreetingRef.value) {
      friendRequestGreetingRef.value.focus()
      friendRequestGreetingRef.value.select()
    }
  })
}

// 从用户信息弹窗中添加好友
const addFriendFromUserInfo = () => {
  // 构建用户对象
  const user = {
    id: selectedUserInfo.value.id,
    username: selectedUserInfo.value.username,
    name: selectedUserInfo.value.name,
    avatar: selectedUserInfo.value.avatar,
    email: selectedUserInfo.value.email
  }
  
  // 如果是群聊，设置默认打招呼内容为"你好，我是来自xxx的yyy"
  if (currentChatInfo.value?.type === 'group' && currentChatInfo.value?.name) {
    const groupName = currentChatInfo.value.name
    const userName = props.user.name || props.user.username || '我'
    friendRequestGreeting.value = `你好，我是来自${groupName}的${userName}`
  } else {
    // 否则使用默认的打招呼内容
    const defaultGreeting = props.user.name || props.user.username || '我'
    friendRequestGreeting.value = `你好，我是${defaultGreeting}`
  }
  
  selectedFriendRequestUser.value = user
  friendRequestRemark.value = ''
  showFriendRequestModal.value = true
  sendingFriendRequest.value = false
  
  // 关闭用户信息弹窗
  closeUserInfoDialog()
  
  nextTick(() => {
    if (friendRequestGreetingRef.value) {
      friendRequestGreetingRef.value.focus()
      friendRequestGreetingRef.value.select()
    }
  })
}

// 显示AI推荐原因
const showAIRecommendationReason = async (recommendation) => {
  selectedRecommendationForReason.value = recommendation
  showAIReasonModal.value = true
  aiRecommendationReason.value = ''
  aiReasonError.value = ''
  loadingAIReason.value = true
  
  try {
    // 调用后端API生成推荐原因
    const data = await friend.getRecommendationReason(recommendation.user_id)
    if (data.code === 200 && data.data && data.data.reason) {
      aiRecommendationReason.value = data.data.reason
    } else {
      aiReasonError.value = data.message || '生成推荐原因失败'
    }
  } catch (e) {
    console.error('获取AI推荐原因失败:', e)
    aiReasonError.value = '获取推荐原因失败，请稍后重试'
  } finally {
    loadingAIReason.value = false
  }
}

// 关闭AI推荐原因弹窗
const closeAIReasonModal = () => {
  showAIReasonModal.value = false
  selectedRecommendationForReason.value = null
  aiRecommendationReason.value = ''
  aiReasonError.value = ''
  loadingAIReason.value = false
}

// 从推荐中发送好友申请
const sendFriendRequestFromRecommendation = async (recommendation) => {
  // 打开好友申请弹窗
  const user = {
    id: recommendation.user_id,
    username: recommendation.username,
    name: recommendation.name,
    avatar: recommendation.avatar,
    email: ''
  }
  
  // 如果缺少信息，尝试通过API获取
  if (!user.username) {
    try {
      const data = await friend.getUserInfo(user.id)
      if (data.code === 200 && data.data) {
        user.username = user.username || data.data.username || ''
        user.name = user.name || data.data.name || ''
        user.email = user.email || data.data.email || ''
        user.avatar = user.avatar || data.data.avatar || ''
      }
    } catch (e) {
      console.error('获取用户信息失败:', e)
    }
  }
  
  // 设置默认打招呼内容
  const defaultGreeting = props.user.name || props.user.username || '我'
  friendRequestGreeting.value = `你好，我是${defaultGreeting}`
  
  selectedFriendRequestUser.value = user
  friendRequestRemark.value = ''
  showFriendRequestModal.value = true
  sendingFriendRequest.value = false
  
  nextTick(() => {
    if (friendRequestGreetingRef.value) {
      friendRequestGreetingRef.value.focus()
      friendRequestGreetingRef.value.select()
    }
  })
}

// 从系统通知中打开申请添加好友弹窗
const openFriendRequestModalFromSystemNotification = async (receiverInfo) => {
  // 如果接收者信息不完整，尝试从当前聊天信息中获取
  let user = {
    id: receiverInfo.id,
    username: receiverInfo.username || currentChatInfo.value?.username || '',
    name: receiverInfo.name || currentChatInfo.value?.name || '',
    avatar: receiverInfo.avatar || currentChatInfo.value?.avatar || '',
    email: receiverInfo.email || currentChatInfo.value?.email || ''
  }
  
  // 如果仍然缺少信息，尝试通过API获取
  if (!user.email || !user.username) {
    try {
      const data = await friend.getUserInfo(user.id)
      if (data.code === 200 && data.data) {
        user.username = user.username || data.data.username || ''
        user.name = user.name || data.data.name || ''
        user.email = user.email || data.data.email || ''
        user.avatar = user.avatar || data.data.avatar || ''
      }
    } catch (e) {
      console.error('获取用户信息失败:', e)
    }
  }
  
  // 设置默认打招呼内容
  const defaultGreeting = props.user.name || props.user.username || '我'
  friendRequestGreeting.value = `你好，我是${defaultGreeting}`
  
  selectedFriendRequestUser.value = user
  friendRequestRemark.value = ''
  showFriendRequestModal.value = true
  sendingFriendRequest.value = false
  
  nextTick(() => {
    if (friendRequestGreetingRef.value) {
      friendRequestGreetingRef.value.focus()
      friendRequestGreetingRef.value.select()
    }
  })
}

const closeFriendRequestModal = () => {
  if (friendRequestGreetingRef.value) {
    friendRequestGreetingRef.value.blur()
  }
  showFriendRequestModal.value = false
  selectedFriendRequestUser.value = null
  friendRequestGreeting.value = ''
  friendRequestRemark.value = ''
  sendingFriendRequest.value = false
}

const submitFriendRequest = async () => {
  if (!selectedFriendRequestUser.value) return
  const greetingText = friendRequestGreeting.value.trim()
  if (!greetingText) {
    showToast('打招呼内容不能为空', 'error')
    return
  }
  if (sendingFriendRequest.value) return
  sendingFriendRequest.value = true
  try {
    const data = await friend.sendRequest({
      receiver_id: selectedFriendRequestUser.value.id,
      greeting: greetingText,
      remark: friendRequestRemark.value.trim()
    })
    if (data.code === 200) {
      showToast('申请已发送，请等待对方确认', 'success')
      const targetUserId = selectedFriendRequestUser.value.id
      closeFriendRequestModal()
      pendingOutgoingUserIds.value = Array.from(new Set([...pendingOutgoingUserIds.value, targetUserId]))
      searchResults.value = searchResults.value.map(item => {
        if (item.id === targetUserId) {
          return { ...item, requestStatus: 'pending' }
        }
        return item
      })
      updateSearchResultRequestFlags()
      await loadFriendRequests()
    } else {
      showToast(data.message || '发送好友申请失败', 'error')
    }
  } catch (e) {
    console.error('发送好友申请失败:', e)
    showToast('发送好友申请失败，请稍后重试', 'error')
  } finally {
    sendingFriendRequest.value = false
  }
}

const respondFriendRequest = async (request, action) => {
  if (!request || isProcessingRequest(request.id)) return
  processingRequestIds.value = [...processingRequestIds.value, request.id]
  try {
    const data = await friend.respondRequest(request.id, action)
    if (data.code === 200) {
      if (action === 'accept') {
        showToast('申请已通过', 'success')
        await loadFriendList()
        await loadChatList()
      } else {
        showToast('申请已拒绝', 'success')
      }
      await loadFriendRequests()
      if (selectedFriendRequest.value && selectedFriendRequest.value.id === request.id) {
        closeUserInfoDialog()
      }
    } else {
      showToast(data.message || '操作失败，请稍后重试', 'error')
    }
  } catch (e) {
    console.error('处理好友申请失败:', e)
    showToast('操作失败，请稍后重试', 'error')
  } finally {
    processingRequestIds.value = processingRequestIds.value.filter(id => id !== request.id)
  }
}

const selectFile = () => {
  if (isGroupDisbanded.value) {
    showToast('无法在已解散的群聊中发送消息', 'error')
    return
  }
  fileInput.value?.click()
}

const selectImage = () => {
  if (isGroupDisbanded.value) {
    showToast('无法在已解散的群聊中发送消息', 'error')
    return
  }
  imageInput.value?.click()
}

const handleFileSelect = async (event) => {
  const file = event.target.files[0]
  if (!file) return
  
  if (!ws.value || ws.value.readyState !== WebSocket.OPEN) {
    showToast('请先选择聊天对象', 'error')
    return
  }
  
  try {
    const reader = new FileReader()
    reader.onload = async (e) => {
      const base64Content = e.target.result.split(',')[1]
      
      // 发送文件开始标记
      const startMsg = {
        sender_id: props.user.id,
        receiver_id: currentChatInfo.value.user_id || props.user.id,
        type: 'file',
        fileType: 'start',
        filename: file.name,
        fileInfo: JSON.stringify({
          fileSize: file.size,
          fileName: file.name,
          fileType: file.type
        })
      }
      ws.value.send(JSON.stringify(startMsg))
      
      // 分块发送文件
      const chunkSize = 64 * 1024 // 64KB chunks
      let offset = 0
      
      while (offset < base64Content.length) {
        const chunk = base64Content.slice(offset, offset + chunkSize)
        const uploadMsg = {
          sender_id: props.user.id,
          receiver_id: currentChatInfo.value.user_id || props.user.id,
          type: 'file',
          fileType: 'upload',
          filename: file.name,
          content: chunk
        }
        ws.value.send(JSON.stringify(uploadMsg))
        offset += chunkSize
      }
    }
    reader.readAsDataURL(file)
  } catch (e) {
    console.error('发送文件失败:', e)
    showToast('发送文件失败', 'error')
  }
  
  event.target.value = ''
}

const handleImageSelect = async (event) => {
  const file = event.target.files[0]
  if (!file) return
  
  if (!ws.value || ws.value.readyState !== WebSocket.OPEN) {
    showToast('请先选择聊天对象', 'error')
    return
  }
  
  try {
    const reader = new FileReader()
    reader.onload = (e) => {
      const base64Content = e.target.result.split(',')[1]
      const message = {
        sender_id: props.user.id,
        receiver_id: currentChatInfo.value.user_id || props.user.id,
        type: 'image',
        content: base64Content,
        filename: file.name
      }
      ws.value.send(JSON.stringify(message))
    }
    reader.readAsDataURL(file)
  } catch (e) {
    console.error('发送图片失败:', e)
    showToast('发送图片失败', 'error')
  }
  
  event.target.value = ''
}

const logout = () => {
  if (ws.value) {
    ws.value.close()
  }
  clearToken()
  sentFriendRequests.value = []
  receivedFriendRequests.value = []
  pendingOutgoingUserIds.value = []
  pendingIncomingUserIds.value = []
  previousSentRequestStatuses.value = {}
  friendRequestsLoadedOnce.value = false
  emits('logout')
}

// 删除好友
const deleteFriend = () => {
  if (!selectedUserInfo.value || !selectedUserInfo.value.id) {
    return
  }
  
  const friendId = selectedUserInfo.value.id
  const friendName = selectedUserInfo.value.remark || selectedUserInfo.value.name || selectedUserInfo.value.username || '好友'
  
  // 如果在通讯录选项卡下，只关闭弹窗（如果有），不关闭右侧面板
  // 否则关闭用户信息对话框，避免遮挡删除确认对话框
  if (currentTab.value === 'contact' && rightPanelView.value === 'userInfo') {
    // 在通讯录选项卡下，只关闭弹窗，保持右侧面板显示
    showUserInfoDialog.value = false
  } else {
    closeUserInfoDialog()
  }
  
  // 显示确认对话框
  deleteFriendName.value = friendName
  pendingDeleteFriendId.value = friendId
  showDeleteFriendConfirm.value = true
}

// 检查当前用户是否有某个用户的好友关系
const hasFriendRelation = (userId) => {
  if (!userId || userId === props.user.id) {
    return false
  }
  
  // 在好友列表中查找
  for (const group of friendList.value) {
    if (group.friend && Array.isArray(group.friend)) {
      const friendItem = group.friend.find(f => f.user_id === userId)
      if (friendItem) {
        return true
      }
    }
  }
  
  return false
}

// 从好友列表中获取好友项（包括room）
const getFriendItem = (userId) => {
  if (!userId) {
    return null
  }
  
  // 在好友列表中查找
  for (const group of friendList.value) {
    if (group.friend && Array.isArray(group.friend)) {
      const friendItem = group.friend.find(f => f.user_id === userId)
      if (friendItem) {
        return friendItem
      }
    }
  }
  
  return null
}

// 发送消息给用户
const sendMessageToUser = async () => {
  if (!selectedUserInfo.value || !selectedUserInfo.value.id) {
    return
  }
  
  const targetUserId = selectedUserInfo.value.id
  
  // 如果目标用户是自己，不处理
  if (targetUserId === props.user.id) {
    return
  }
  
  // 检查是否有好友关系
  const friendItem = getFriendItem(targetUserId)
  if (!friendItem) {
    showToast('需要先添加好友才能发送消息', 'error')
    return
  }
  
  // 关闭用户信息弹窗
  closeUserInfoDialog()
  
  // 关闭设置弹窗（如果打开）
  showSettingsModal.value = false
  
  // 在聊天列表中查找是否已有该用户的聊天
  const existingChat = chatList.value.find(item => {
    return item.type === 'private' && 
           item.chat_type === 'private' && 
           item.user_id === targetUserId
  })
  
  // 切换到聊天选项卡
  currentTab.value = 'chat'
  
  if (existingChat) {
    // 如果已有聊天，直接打开
    await selectChat(existingChat)
  } else {
    // 如果没有聊天记录，从好友列表中获取room
    if (friendItem.room) {
      // 确保有显示名称，优先使用备注，然后是昵称，最后是用户名
      const displayName = selectedUserInfo.value.remark || 
                         selectedUserInfo.value.name || 
                         selectedUserInfo.value.username ||
                         friendItem.remark ||
                         friendItem.name ||
                         friendItem.username ||
                         '用户'
      
      // 创建聊天项并打开
      const chatItem = {
        room: friendItem.room,
        type: 'private',
        chat_type: 'private',
        user_id: targetUserId,
        name: displayName,
        remark: selectedUserInfo.value.remark || friendItem.remark || null,
        username: selectedUserInfo.value.username || friendItem.username || '',
        avatar: selectedUserInfo.value.avatar || friendItem.avatar || ''
      }
      await selectChat(chatItem)
    } else {
      showToast('无法找到聊天房间，请稍后重试', 'error')
    }
  }
}

// 确认删除好友
const confirmDeleteFriend = async () => {
  if (!pendingDeleteFriendId.value) {
    return
  }
  
  const friendId = pendingDeleteFriendId.value
  
  try {
    const data = await friend.delete(friendId)
    if (data.code === 200) {
      showToast('已删除好友', 'success')
      
      // 刷新好友列表
      await loadFriendList()
      
      // 如果当前正在和该好友聊天，关闭聊天窗口
      if (currentChatInfo.value?.type === 'private' && currentChatInfo.value?.user_id === friendId) {
        currentChatInfo.value = null
        currentRoom.value = null
        messages.value = []
        if (ws.value) {
          ws.value.close()
          ws.value = null
        }
      }
      
      // 从聊天列表中移除该好友的聊天记录
      chatList.value = chatList.value.filter(item => {
        if (item.type === 'private' && item.user_id === friendId) {
          return false
        }
        return true
      })
      
      // 如果在通讯录选项卡下且右侧面板显示用户信息，更新用户信息而不是关闭面板
      if (currentTab.value === 'contact' && rightPanelView.value === 'userInfo' && selectedUserInfo.value.id === friendId) {
        // 更新用户信息，标记为不再是好友
        selectedUserInfo.value.is_friend = false
        selectedUserInfo.value.remark = ''
        // 重新加载用户信息以获取最新状态
        try {
          const userInfoData = await friend.getUserInfo(friendId)
          if (userInfoData.code === 200 && userInfoData.data) {
            selectedUserInfo.value = {
              ...selectedUserInfo.value,
              id: userInfoData.data.id,
              username: userInfoData.data.username || '',
              name: userInfoData.data.name || userInfoData.data.username || '',
              avatar: userInfoData.data.avatar || '',
              email: userInfoData.data.email || '',
              remark: '',
              is_friend: false,
              is_blocked: userInfoData.data.is_blocked || 0
            }
          }
        } catch (e) {
          console.error('重新加载用户信息失败:', e)
        }
        // 清除选中状态
        selectedFriendId.value = null
      } else {
        // 关闭用户信息对话框和确认对话框
        closeUserInfoDialog()
      }
      
      showDeleteFriendConfirm.value = false
      pendingDeleteFriendId.value = null
      deleteFriendName.value = ''
    } else {
      showToast(data.message || '删除好友失败', 'error')
      showDeleteFriendConfirm.value = false
    }
  } catch (e) {
    console.error('删除好友失败:', e)
    showToast('删除好友失败，请稍后重试', 'error')
    showDeleteFriendConfirm.value = false
  }
}

// 拉黑好友
const confirmBlockFriend = async () => {
  if (!selectedUserInfo.value || !selectedUserInfo.value.id) {
    return
  }
  
  const friendId = selectedUserInfo.value.id
  
  try {
    const data = await friend.block(friendId)
    if (data.code === 200) {
      showToast('已拉黑好友', 'success')
      
      // 刷新好友列表
      await loadFriendList()
      
      // 从聊天列表中移除该好友的聊天记录
      chatList.value = chatList.value.filter(item => {
        if (item.type === 'private' && item.user_id === friendId) {
          return false
        }
        return true
      })
      
      // 如果当前正在和该好友聊天，关闭聊天窗口
      if (currentChatInfo.value?.type === 'private' && currentChatInfo.value?.user_id === friendId) {
        currentChatInfo.value = null
        currentRoom.value = null
        messages.value = []
        if (ws.value) {
          ws.value.close()
          ws.value = null
        }
      }
      
      // 更新用户信息中的拉黑状态
      selectedUserInfo.value.is_blocked = 1
      
      // 关闭用户信息对话框和确认对话框
      closeUserInfoDialog()
      showBlockFriendConfirm.value = false
    } else {
      showToast(data.message || '拉黑好友失败', 'error')
      showBlockFriendConfirm.value = false
    }
  } catch (e) {
    console.error('拉黑好友失败:', e)
    showToast('拉黑好友失败，请稍后重试', 'error')
    showBlockFriendConfirm.value = false
  }
}

// 解除拉黑好友
const confirmUnblockFriend = async () => {
  if (!selectedUserInfo.value || !selectedUserInfo.value.id) {
    return
  }
  
  const friendId = selectedUserInfo.value.id
  
  try {
    const data = await friend.unblock(friendId)
    if (data.code === 200) {
      showToast('已解除拉黑', 'success')
      
      // 刷新好友列表
      await loadFriendList()
      
      // 重新加载聊天列表（这样被拉黑的好友的聊天会重新出现）
      await loadChatList()
      
      // 更新用户信息中的拉黑状态
      selectedUserInfo.value.is_blocked = 0
      
      // 关闭用户信息对话框和确认对话框
      closeUserInfoDialog()
      showUnblockFriendConfirm.value = false
    } else {
      showToast(data.message || '解除拉黑失败', 'error')
      showUnblockFriendConfirm.value = false
    }
  } catch (e) {
    console.error('解除拉黑失败:', e)
      showToast('解除拉黑失败，请稍后重试', 'error')
      showUnblockFriendConfirm.value = false
  }
}

// 加载黑名单列表
const loadBlacklist = async () => {
  try {
    const data = await friend.getBlacklist()
    if (data.code === 200 && data.data) {
      blacklist.value = data.data
    }
  } catch (e) {
    console.error('加载黑名单失败:', e)
  }
}

// 显示黑名单用户信息
const showBlacklistUserInfo = async (user) => {
  await showUserInfo(user.user_id || user.id, user.avatar, user.name || user.username)
}

// 初始化兴趣爱好（从用户信息中加载）
const initInterests = async (userData) => {
  const interestsData = userData?.interests || props.user?.interests || ''
      // 处理interests可能是JSON数组字符串或逗号分隔字符串的情况
      if (typeof interestsData === 'string') {
        try {
          const parsed = JSON.parse(interestsData)
          if (Array.isArray(parsed)) {
            selectedInterests.value = parsed.filter(t => t && t.trim())
          } else {
            selectedInterests.value = interestsData ? interestsData.split(',').filter(t => t.trim()) : []
          }
        } catch (e) {
          // 不是JSON格式，按逗号分隔字符串处理
          selectedInterests.value = interestsData ? interestsData.split(',').filter(t => t.trim()) : []
        }
      } else if (Array.isArray(interestsData)) {
        selectedInterests.value = interestsData.filter(t => t && t.trim())
      } else {
        selectedInterests.value = []
      }
      // 重置搜索和展开状态
      interestSearchQuery.value = ''
      expandedCategories.value = []
}

// 监听设置弹窗打开
watch(showSettingsModal, async (newVal) => {
  if (newVal) {
    // 初始化个性签名
    if (settingsCurrentTab.value === 'signature') {
      editingSignature.value = props.user.signature || ''
    }
    // 初始化兴趣爱好 - 从后端重新获取用户信息以确保数据是最新的
    if (settingsCurrentTab.value === 'interests') {
      try {
        // 从后端重新获取当前用户信息
        const data = await friend.getUserInfo(props.user.id)
        if (data.code === 200 && data.data) {
          await initInterests(data.data)
        } else {
          // 如果获取失败，使用props.user中的信息
          await initInterests(props.user)
        }
      } catch (e) {
        console.error('获取用户信息失败:', e)
        // 如果获取失败，使用props.user中的信息
        await initInterests(props.user)
      }
    }
    // 加载黑名单
    if (settingsCurrentTab.value === 'blacklist') {
      loadBlacklist()
    }
  }
})

// 监听设置标签切换
watch(settingsCurrentTab, async (newVal) => {
  if (newVal === 'signature' && showSettingsModal.value) {
    // 初始化个性签名
    editingSignature.value = props.user.signature || ''
  } else if (newVal === 'interests' && showSettingsModal.value) {
    // 初始化兴趣爱好 - 从后端重新获取用户信息以确保数据是最新的
    try {
      // 从后端重新获取当前用户信息
      const data = await friend.getUserInfo(props.user.id)
      if (data.code === 200 && data.data) {
        await initInterests(data.data)
        } else {
        // 如果获取失败，使用props.user中的信息
        await initInterests(props.user)
        }
      } catch (e) {
      console.error('获取用户信息失败:', e)
      // 如果获取失败，使用props.user中的信息
      await initInterests(props.user)
    }
  } else if (newVal === 'blacklist' && showSettingsModal.value) {
    // 加载黑名单
    loadBlacklist()
  }
})
</script>

<style scoped>
.chat-container {
  display: flex;
  height: 100vh;
  width: 100vw;
  background: #f5f5f5;
  overflow: hidden;
}

.sidebar {
  width: 200px;
  height: 100vh;
  background: #2c3e50;
  color: #fff;
  display: flex;
  flex-direction: column;
  padding: 20px;
  overflow: hidden;
  flex-shrink: 0;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #409eff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  overflow: hidden;
  position: relative;
}

.avatar span {
  position: relative;
  z-index: 1;
}

.avatar-clickable {
  cursor: pointer;
  transition: transform 0.2s;
  position: relative;
}

.avatar-clickable:hover {
  transform: scale(1.05);
}

.avatar-edit-icon {
  position: absolute;
  bottom: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.6);
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  z-index: 2;
  opacity: 0;
  transition: opacity 0.2s;
  color: #fff;
  line-height: 1;
}

.avatar-edit-icon::before {
  content: '';
  width: 12px;
  height: 12px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='white'%3E%3Cpath d='M12 12c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm0-8c-2.2 0-4 1.8-4 4s1.8 4 4 4 4-1.8 4-4-1.8-4-4-4zm0 10c-3.3 0-6-2.7-6-6s2.7-6 6-6 6 2.7 6 6-2.7 6-6 6zm0-10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z'/%3E%3Cpath d='M12 9c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 5c-1.7 0-3-1.3-3-3s1.3-3 3-3 3 1.3 3 3-1.3 3-3 3z'/%3E%3Cpath d='M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z'/%3E%3C/svg%3E");
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  display: block;
}

.avatar-clickable:hover .avatar-edit-icon {
  opacity: 1;
}

/* 只在侧边栏自己的头像上显示"点击修改头像"提示 */
.sidebar .avatar-clickable:hover::after {
  content: '点击修改头像';
  position: absolute;
  bottom: -20px;
  right: 0;
  color: #fff;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  white-space: nowrap;
  z-index: 10;
  pointer-events: none;
}

.user-info-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.user-name {
  font-weight: bold;
  font-size: 14px;
  line-height: 1.4;
}

.user-name-editable {
  cursor: pointer;
  transition: color 0.2s;
  position: relative;
}

.user-name-editable:hover {
  color: #409eff;
}

.user-name-editable:hover::after {
  content: '✏️';
  margin-left: 5px;
  font-size: 12px;
}

.user-username {
  font-size: 12px;
  color: #999;
  line-height: 1.2;
}

.user-username-editable {
  cursor: pointer;
  transition: color 0.2s;
  position: relative;
}

.user-username-editable:hover {
  color: #409eff;
}

.user-username-editable:hover::after {
  content: '✏️';
  margin-left: 5px;
  font-size: 12px;
}

.nickname-edit-container {
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
}

.nickname-input {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid #409eff;
  border-radius: 4px;
  font-size: 14px;
  outline: none;
  font-weight: bold;
}

.nickname-edit-buttons {
  display: flex;
  gap: 5px;
}

.nickname-save-btn,
.nickname-cancel-btn {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: background 0.2s;
  flex-shrink: 0;
}

.nickname-save-btn {
  background: #67c23a;
  color: #fff;
}

.nickname-save-btn:hover {
  background: #5daf34;
}

.nickname-cancel-btn {
  background: #f56c6c;
  color: #fff;
}

.nickname-cancel-btn:hover {
  background: #dd6161;
}

.tabs {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
}

.tab {
  flex: 1;
  padding: 8px;
  border: none;
  background: transparent;
  color: #ccc;
  cursor: pointer;
  border-radius: 4px;
}

.tab.active {
  background: #409eff;
  color: #fff;
}

.settings-btn {
  margin-top: auto;
  margin-bottom: 10px;
  flex: 0 0 auto;
  height: auto;
}

.logout-btn {
  padding: 10px;
  border: none;
  background: #e74c3c;
  color: #fff;
  border-radius: 4px;
  cursor: pointer;
  height: 40px;
  flex-shrink: 0;
}

.list-area {
  width: 300px;
  height: 100vh;
  background: #fff;
  border-right: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
}

.list-header {
  padding: 10px;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  gap: 10px;
  flex-shrink: 0;
  align-items: center;
}

.search-input {
  flex: 1;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  min-width: 0;
}

.add-btn {
  padding: 8px 12px;
  border: none;
  background: #409eff;
  color: #fff;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  font-size: 13px;
}

.create-group-btn {
  padding: 8px 12px;
  border: none;
  background: #67c23a;
  color: #fff;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
}

.create-group-btn:hover {
  background: #5daf34;
}

.list-content {
  flex: 1;
  overflow-y: auto;
}

.chat-item {
  display: flex;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid #f0f0f0;
  cursor: pointer;
  gap: 10px;
  position: relative;
}

.chat-item:hover {
  background: #f5f5f5;
}

.chat-item.active {
  background: #e3f2fd;
}

.pinned-chat-item {
  background: #f5f5f5;
}

.pinned-chat-item:hover {
  background: #eeeeee;
}

.pinned-chat-item.active {
  background: #e0e0e0;
}

.ai-friend-entry {
  display: flex;
  align-items: center;
  padding: 12px;
  cursor: pointer;
  border-bottom: 1px solid #e0e0e0;
  transition: background-color 0.2s;
  gap: 10px;
}

.ai-friend-entry:hover {
  background-color: #f5f5f5;
}

.ai-friend-entry.active {
  background-color: #e3f2fd;
}

.ai-friend-avatar {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
  color: white;
  font-size: 20px;
}

.avatar-small.ai-friend-avatar {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
  color: white;
  font-size: 20px;
}

.avatar-large.ai-friend-avatar {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
  color: white;
  font-size: 36px;
}

.message-avatar.ai-friend-avatar {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
  font-size: 24px;
}

.ai-friend-type-tag {
  font-size: 12px;
  color: #999;
  font-weight: normal;
}

.ai-friend-type-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ai-friend-type-item {
  padding: 16px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.ai-friend-type-item:hover {
  border-color: #409eff;
  background-color: #f5f7fa;
}

.ai-friend-type-item.active {
  border-color: #409eff;
  background-color: #ecf5ff;
}

.ai-friend-type-name {
  font-size: 16px;
  font-weight: 600;
  color: #333;
  margin-bottom: 4px;
}

.ai-friend-type-desc {
  font-size: 14px;
  color: #666;
}

.avatar-small {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #409eff;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: bold;
  overflow: hidden;
  position: relative;
}

.avatar-small span {
  position: relative;
  z-index: 1;
}

.chat-info {
  flex: 1;
  min-width: 0;
}

.chat-name {
  font-weight: bold;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.match-field {
  font-size: 12px;
  color: #999;
  font-weight: normal;
}

.chat-preview {
  font-size: 12px;
  color: #666;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-preview .mention-tag {
  color: #ff0000 !important;
  font-weight: bold;
  margin-right: 4px;
}

.chat-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
}

.chat-time {
  font-size: 11px;
  color: #999;
  white-space: nowrap;
}

.chat-meta-icons {
  display: flex;
  align-items: center;
  gap: 4px;
}

.mute-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.unread-badge {
  background: #f56c6c;
  color: #fff;
  border-radius: 10px;
  padding: 2px 6px;
  font-size: 12px;
  min-width: 18px;
  text-align: center;
}

.unread-badge.unread-dot {
  width: 8px;
  height: 8px;
  min-width: 8px;
  padding: 0;
  border-radius: 50%;
}

.contact-list {
  padding: 10px;
}

.friend-group {
  margin-bottom: 20px;
}

.group-name {
  font-weight: bold;
  margin-bottom: 10px;
  color: #666;
}

.friend-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  cursor: pointer;
  border-radius: 4px;
}

.friend-item:hover {
  background: #f5f5f5;
}

.friend-item.active {
  background: #e3f2fd;
}

.friend-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  flex: 1;
}

.blocked-tag {
  font-size: 12px;
  color: #999;
  font-weight: normal;
}

.chat-area {
  flex: 1;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #fff;
  overflow: hidden;
}

/* 右侧面板样式 */
.right-panel-content {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #fff;
  overflow: hidden;
}

.right-panel-header {
  padding: 15px 20px;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.right-panel-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: bold;
  color: #333;
}

.right-panel-header .close-btn {
  background: none;
  border: none;
  font-size: 28px;
  color: #999;
  cursor: pointer;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
}

.right-panel-header .close-btn:hover {
  color: #333;
}

.right-panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.user-info-panel .right-panel-body,
.group-info-panel .right-panel-body {
  padding: 20px;
}
.empty-chat {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-text {
  color: #999;
  font-size: 18px;
}

.empty-search {
  padding: 40px 20px;
  text-align: center;
}

.chat-room {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chat-header {
  padding: 15px;
  border-bottom: 1px solid #e0e0e0;
  font-weight: bold;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.chat-header-buttons {
  display: flex;
  align-items: center;
  gap: 0;
}

.room-name {
  font-size: 16px;
  color: #333;
  display: flex;
  align-items: center;
  gap: 4px;
}

.member-count {
  font-size: 14px;
  color: #999;
  font-weight: normal;
}

.search-history-btn {
  background: transparent;
  border: none;
  font-size: 18px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.search-history-btn:hover {
  background: #f0f0f0;
}

.search-history-icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.message-item {
  display: flex;
  gap: 10px;
  margin-bottom: 15px;
  align-items: flex-start;
}

.message-item.own {
  flex-direction: row-reverse;
  justify-content: flex-start;
}

.message-item.is-system {
  justify-content: center;
  margin: 10px 0;
}

.message-item.is-system .message-avatar {
  display: none !important;
}

.message-item.is-system .message-content {
  display: none !important;
}

.system-notification {
  text-align: center;
  color: #999;
  font-size: 12px;
  padding: 4px 8px;
  background: transparent;
  position: relative;
  display: inline-block;
}

.system-notification-content {
  display: inline-block;
}

.system-notification-time {
  font-size: 10px;
  color: #bbb;
  margin-left: 8px;
  vertical-align: bottom;
  display: inline-block;
}

/* 使用深度选择器确保样式应用到通过v-html插入的按钮 */
:deep(.send-verification-btn) {
  background: transparent !important;
  color: #409eff !important;
  border: none !important;
  padding: 0 !important;
  margin: 0 !important;
  cursor: pointer !important;
  font-size: 12px !important;
  font-family: inherit !important;
  font-weight: normal !important;
  line-height: inherit !important;
  display: inline !important;
  vertical-align: baseline !important;
  text-decoration: none !important;
  transition: color 0.2s ease, text-decoration 0.2s ease !important;
  outline: none !important;
}

:deep(.send-verification-btn:hover) {
  color: #66b1ff !important;
  text-decoration: underline !important;
}

:deep(.send-verification-btn:active) {
  color: #3a8ee6 !important;
}

:deep(.send-verification-btn:focus) {
  outline: none !important;
}

.message-avatar {
  width: 40px;
  height: 40px;
  min-width: 40px;
  min-height: 40px;
  border-radius: 50%;
  background: #409eff;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: bold;
  flex-shrink: 0;
  overflow: hidden;
  position: relative;
}

.message-avatar span {
  position: relative;
  z-index: 1;
}

.message-content {
  max-width: 60%;
  flex: 0 1 auto;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.message-item.own .message-content {
  align-items: flex-end;
}

.message-sender {
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
}

.message-text {
  background: #e8e8e8;
  padding: 8px 12px;
  border-radius: 8px;
  word-wrap: break-word;
  word-break: break-word;
  white-space: pre-wrap;
  display: inline-block;
  max-width: 100%;
  width: fit-content;
  min-width: 0;
}

.message-item.own .message-text {
  background: #409eff;
  color: #fff;
}

.message-image img {
  max-width: 100%;
  max-height: 400px;
  border-radius: 8px;
  cursor: pointer;
  object-fit: contain;
}

.message-file {
  background: #e8e8e8;
  padding: 8px 12px;
  border-radius: 8px;
  word-wrap: break-word;
  word-break: break-word;
  display: inline-block;
  width: fit-content;
  max-width: 100%;
  min-width: 0;
}

.message-item.own .message-file {
  background: #409eff;
  color: #fff;
}

.file-link {
  color: inherit;
  text-decoration: none;
  display: block;
  margin-bottom: 4px;
  cursor: pointer;
}

.message-item.own .file-link {
  color: #fff;
}

.file-link:hover {
  text-decoration: underline;
}

.file-size {
  font-size: 11px;
  color: #999;
  display: block;
}

.message-item.own .file-size {
  color: rgba(255, 255, 255, 0.8);
}

.message-time {
  font-size: 11px;
  color: #999;
  margin-top: 4px;
}

.message-recalled {
  padding: 8px 12px;
  color: #999;
  font-size: 12px;
  font-style: italic;
}

.message-item.is-recalled .message-content {
  opacity: 0.6;
}

.message-bubble-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.verification-warning {
  width: 20px;
  height: 20px;
  min-width: 20px;
  min-height: 20px;
  border-radius: 50%;
  background-color: #ff0000;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.verification-icon {
  color: #ffffff;
  font-size: 14px;
  font-weight: bold;
  line-height: 1;
}

.context-menu {
  position: fixed;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  min-width: 100px;
  padding: 4px 0;
}

.context-menu-item {
  padding: 8px 16px;
  cursor: pointer;
  font-size: 14px;
  color: #333;
  transition: background 0.2s;
}

.context-menu-item:hover {
  background: #f5f5f5;
}

.context-menu-item:active {
  background: #e8e8e8;
}

.context-menu-item-danger {
  color: #f56c6c;
}

.context-menu-item-danger:hover {
  background: #fef0f0;
}

.chat-input-area {
  padding: 15px;
  border-top: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex-shrink: 0;
}

.input-toolbar {
  display: flex;
  gap: 8px;
}

.input-row {
  display: flex;
  gap: 10px;
  align-items: flex-end;
  position: relative;
}

.input-wrapper {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
}

/* @选择器样式 */
.mention-picker {
  position: absolute;
  bottom: 100%;
  left: 0;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  max-height: 200px;
  overflow-y: auto;
  z-index: 1000;
  margin-bottom: 5px;
  min-width: 200px;
}

.mention-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.2s;
}

.mention-item:hover,
.mention-item.active {
  background: #f0f0f0;
}

.mention-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #409eff;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: bold;
  font-size: 14px;
  overflow: hidden;
  flex-shrink: 0;
}

.mention-avatar span {
  position: relative;
  z-index: 1;
}

.mention-name {
  flex: 1;
  font-size: 14px;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 表情选择器样式 */
.emoji-picker {
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  max-height: 300px;
  max-width: 400px;
  display: flex;
  flex-direction: column;
}

.emoji-categories {
  display: flex;
  gap: 5px;
  padding-bottom: 10px;
  border-bottom: 1px solid #e0e0e0;
  margin-bottom: 10px;
}

.emoji-category-btn {
  padding: 5px 10px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 20px;
  border-radius: 4px;
  transition: background 0.2s;
}

.emoji-category-btn:hover {
  background: #f0f0f0;
}

.emoji-category-btn.active {
  background: #e3f2fd;
}

.emoji-list {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 40px));
  gap: 5px;
  overflow-y: auto;
  max-height: 200px;
  padding: 5px;
  justify-content: start;
}

.emoji-item {
  padding: 5px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 24px;
  border-radius: 4px;
  transition: background 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
  max-width: 40px;
  max-height: 40px;
  width: 100%;
  height: 100%;
}

.emoji-item:hover {
  background: #f0f0f0;
}

.tool-btn {
  padding: 6px 12px;
  border: none;
  background: #f0f0f0;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
}

.tool-btn:hover:not(:disabled) {
  background: #e0e0e0;
}

.tool-btn.disabled,
.tool-btn:disabled {
  background: #f5f5f5;
  color: #999;
  cursor: not-allowed;
  opacity: 0.6;
}

.message-input {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  resize: none;
  min-height: 40px;
  max-height: 200px;
  overflow-y: auto;
  font-family: inherit;
  font-size: inherit;
  line-height: 1.5;
  word-wrap: break-word;
  white-space: pre-wrap;
  box-sizing: border-box;
}

/* 推荐回复样式 */
.suggested-replies {
  padding: 8px 12px;
  background: #f8f9fa;
  border-top: 1px solid #e0e0e0;
  border-radius: 0 0 8px 8px;
  position: relative;
}

.suggested-replies-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.suggested-replies-label {
  font-size: 12px;
  color: #666;
}

.suggested-replies-close {
  background: transparent;
  border: none;
  font-size: 20px;
  color: #999;
  cursor: pointer;
  padding: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  transition: all 0.2s;
  border-radius: 50%;
  flex-shrink: 0;
}

.suggested-replies-close:hover {
  background: #e0e0e0;
  color: #333;
}

.suggested-replies-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.suggested-reply-btn {
  padding: 6px 12px;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 16px;
  font-size: 13px;
  color: #333;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.suggested-reply-btn:hover:not(:disabled) {
  background: #409eff;
  color: #fff;
  border-color: #409eff;
}

.suggested-reply-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.message-input.disabled {
  background-color: #f5f5f5;
  color: #999;
  cursor: not-allowed;
  opacity: 0.6;
}

.send-btn {
  padding: 10px 20px;
  border: none;
  background: #409eff;
  color: #fff;
  border-radius: 4px;
  cursor: pointer;
  height: 40px;
  flex-shrink: 0;
}

.send-btn:disabled {
  background: #c0c4cc;
  color: #fff;
  cursor: not-allowed;
  opacity: 0.6;
}

.modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: #fff;
  padding: 20px;
  border-radius: 8px;
  min-width: 400px;
}

.modal-content h3 {
  margin: 0 0 15px;
}

.search-error {
  margin: 20px 0 0;
  text-align: center;
  color: #717171;
  font-size: 14px;
}

.search-user-info {
  margin: 15px 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.search-user-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  border: 1px solid #e0e0e0;
  border-radius: 10px;
  background: #fafafa;
}

.search-user-avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: #409eff;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 24px;
  font-weight: bold;
  overflow: hidden;
  flex-shrink: 0;
}

.search-user-avatar span {
  position: relative;
  z-index: 1;
}

.search-user-details {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.search-user-name {
  font-size: 18px;
  font-weight: 600;
  color: #333;
}

.search-user-username,
.search-user-email {
  font-size: 14px;
  color: #666;
}

.search-user-action {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.search-user-action .btn {
  min-width: 100px;
}

.friend-requests-section {
  margin-bottom: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.friend-request-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: #409eff;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 22px;
  font-weight: bold;
  overflow: hidden;
  flex-shrink: 0;
}

.friend-request-avatar span {
  position: relative;
  z-index: 1;
}

.friend-request-name {
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.friend-request-meta {
  font-size: 13px;
  color: #666;
}

.friend-request-greeting {
  font-size: 13px;
  color: #444;
}

.friend-request-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.friend-request-entry {
  cursor: default;
}

.friend-request-entry .friend-request-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.friend-request-entry .btn.small {
  padding: 6px 12px;
}

.friend-request-entry .status-text {
  font-size: 12px;
  color: #999;
}

.friend-recommendations-section {
  margin-bottom: 15px;
  padding-bottom: 15px;
  border-bottom: 1px solid #e0e0e0;
}

.friend-recommendation-item {
  cursor: pointer;
}

.recommendation-reason {
  display: flex;
  gap: 6px;
  margin-top: 4px;
  flex-wrap: wrap;
}

.reason-tag {
  display: inline-block;
  padding: 2px 8px;
  background: #e3f2fd;
  color: #1976d2;
  border-radius: 10px;
  font-size: 11px;
  line-height: 1.4;
}

.reason-tag.ai-tag {
  background: #f3e5f5;
  color: #7b1fa2;
}

.reason-tag.clickable {
  cursor: pointer;
  transition: all 0.2s;
}

.reason-tag.clickable:hover {
  background: #e1bee7;
  transform: scale(1.05);
}

.reason-tag.ai-tag {
  background: #f3e5f5;
  color: #7b1fa2;
}

.ai-badge,
.score-badge {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.4;
}

.ai-badge {
  background: #f3e5f5;
  color: #7b1fa2;
}

.score-badge {
  background: #fff3e0;
  color: #e65100;
}

.ai-reason-modal {
  max-width: 500px;
}

.recommendation-user-info {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 15px;
  background: #f5f5f5;
  border-radius: 8px;
  margin-bottom: 20px;
}

.recommendation-avatar {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: #409eff;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 24px;
  font-weight: bold;
  flex-shrink: 0;
  overflow: hidden;
}

.recommendation-user-details {
  flex: 1;
}

.recommendation-user-name {
  font-size: 16px;
  font-weight: 600;
  color: #333;
  margin-bottom: 5px;
}

.recommendation-user-meta {
  font-size: 13px;
  color: #666;
  display: flex;
  gap: 15px;
}

.ai-reason-content {
  min-height: 100px;
  padding: 15px;
  background: #fafafa;
  border-radius: 8px;
  border: 1px solid #e0e0e0;
}

.loading-ai-reason {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 15px;
  padding: 30px;
  color: #666;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #409eff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.ai-reason-text {
  font-size: 14px;
  line-height: 1.8;
  color: #333;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.ai-reason-error {
  color: #f56c6c;
  font-size: 14px;
  text-align: center;
  padding: 20px;
}

.friend-request-actions.waiting {
  justify-content: flex-end;
}

.friend-request-summary {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.friend-request-summary .friend-request-avatar {
  width: 48px;
  height: 48px;
  font-size: 18px;
}

.friend-request-summary-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.search-results-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.search-results-table thead {
  background: #f5f5f5;
}

.search-results-table th {
  padding: 10px;
  text-align: left;
  font-weight: 600;
  color: #333;
  border-bottom: 2px solid #ddd;
}

.search-results-table td {
  padding: 10px;
  border-bottom: 1px solid #eee;
  color: #666;
}

.search-results-table tbody tr:hover {
  background: #f9f9f9;
}

.search-results-table tbody tr:last-child td {
  border-bottom: none;
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.btn.primary {
  background: #409eff;
  color: #fff;
}

.btn.small {
  padding: 4px 8px;
  font-size: 12px;
}

.btn.danger {
  background: #f56c6c;
  color: #fff;
}

.btn.danger:hover {
  background: #dd6161;
}

.btn.send-message-btn {
  background: #409eff;
  color: #fff;
}

.btn.send-message-btn:hover {
  background: #337ecc;
}

.status-text {
  color: #999;
  font-size: 12px;
}

.status-text.notice-text {
  color: #409eff;
}

/* 模态框样式 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
  overflow-y: auto;
}

/* 用户信息弹窗的 z-index 更高，确保显示在其他弹窗之上 */
.user-info-overlay {
  z-index: 1004;
}

.block-friend-overlay {
  z-index: 1005;
}

.delete-friend-overlay {
  z-index: 1006;
}

.modal-content {
  background: #fff;
  border-radius: 8px;
  width: 90%;
  max-width: 400px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  animation: modalSlideIn 0.3s ease-out;
}
/* 统一认证相关弹窗大小（修改用户名 / 忘记密码） */
.auth-modal {
  max-width: 420px;
  min-width: 400px;
  /* 固定统一高度并启用弹性布局，保证两个弹窗竖向一致 */
  height: 460px;
  display: flex;
  flex-direction: column;
}

/* 添加好友对话框需要更宽的宽度以容纳表格 */
.add-friend-modal {
  max-width: 700px;
  min-width: 600px;
}

.friend-request-modal {
  max-width: 440px;
  min-width: 380px;
}

@keyframes modalSlideIn {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #e0e0e0;
  flex-shrink: 0;
}

.modal-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.modal-back-btn {
  background: transparent;
  border: none;
  font-size: 20px;
  color: #666;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 0.2s;
  flex-shrink: 0;
}

.modal-back-btn:hover {
  background: #f0f0f0;
  color: #333;
}

.modal-header-left h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #333;
  flex: 1;
}

.modal-header h3 {
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

.modal-body {
  padding: 20px;
}


.search-input-row {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 10px;
}

.search-input-row .search-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  outline: none;
}

.search-input-row .search-input:focus {
  border-color: #409eff;
}

.search-input-row .btn {
  flex-shrink: 0;
  white-space: nowrap;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  /* 增大每一行之间的间距 */
  margin-bottom: 16px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-group label {
  font-size: 14px;
  font-weight: 500;
  color: #333;
}

.modal-input {
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.modal-input:focus {
  border-color: #409eff;
}

.modal-textarea {
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
  min-height: 100px;
  max-height: 240px;
  resize: vertical;
  font-family: inherit;
  line-height: 1.4;
}

.modal-textarea:focus {
  border-color: #409eff;
}

.form-hint {
  font-size: 12px;
  color: #999;
}

.form-error {
  font-size: 12px;
  color: #d03050;
  margin-top: 4px;
}

.input-error {
  border-color: #d03050 !important;
}

.required {
  color: #d03050;
}

.current-username-display {
  padding: 8px 12px;
  background: #f5f5f5;
  border-radius: 4px;
  font-size: 14px;
  color: #666;
}

.forget-password-link-inline {
  margin-top: 6px;
}

.forget-password-link-inline a {
  color: #409eff;
  text-decoration: none;
  font-size: 12px;
}

.forget-password-link-inline a:hover {
  text-decoration: underline;
}

.modal-footer {
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

.modal-btn.confirm-btn.danger {
  background: #f56c6c;
  color: #fff;
}

.modal-btn.confirm-btn.danger:hover {
  background: #dd6161;
}

/* 用户信息模态框样式 */
.user-info-modal {
  max-width: 500px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.user-info-body {
  padding: 30px;
  display: flex;
  align-items: flex-start;
  gap: 20px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.user-info-avatar-large {
  flex-shrink: 0;
  margin-top: 0;
}

.avatar-large {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background: #409eff;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: bold;
  font-size: 36px;
  overflow: hidden;
  position: relative;
  border: 3px solid #e0e0e0;
}

.avatar-large.avatar-clickable {
  cursor: pointer;
  transition: transform 0.2s;
}

.avatar-large.avatar-clickable:hover {
  transform: scale(1.05);
}

.avatar-large span {
  position: relative;
  z-index: 1;
}

.user-info-details {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.user-info-name {
  font-size: 20px;
  font-weight: bold;
  color: #333;
  line-height: 1.4;
}

.user-info-group-nickname {
  font-size: 14px;
  color: #999;
  line-height: 1.2;
  margin-top: 4px;
}

.user-info-nickname {
  font-size: 14px;
  color: #999;
  line-height: 1.2;
  margin-top: 4px;
}

.user-info-username {
  font-size: 14px;
  color: #999;
  line-height: 1.2;
  margin-top: 4px;
}

.user-info-email {
  font-size: 14px;
  color: #999;
  line-height: 1.2;
  margin-top: 4px;
}

.user-info-signature {
  font-size: 14px;
  color: #999;
  line-height: 1.2;
  margin-top: 4px;
}

.user-info-interests {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #e0e0e0;
}

.user-info-interests-label {
  font-size: 14px;
  color: #666;
  margin-bottom: 8px;
}

.user-info-interests-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.user-info-interest-tag {
  display: inline-block;
  padding: 4px 12px;
  background: #f0f0f0;
  border-radius: 12px;
  font-size: 13px;
  color: #666;
  line-height: 1.4;
}

.interests-section {
  margin-top: 10px;
}

.interests-selected-section {
  position: sticky;
  top: -20px;
  z-index: 10;
  background: #fff;
  margin: -20px -20px 20px -20px;
  padding: 20px 20px 15px 20px;
  border-bottom: 1px solid #e0e0e0;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.interests-selected-section .interests-tags {
  min-height: 30px;
}

.interests-empty-hint {
  color: #999;
  font-size: 13px;
  font-style: italic;
}

.interests-search-section {
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid #e0e0e0;
}

.interests-search-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.interests-search-input:focus {
  border-color: #409eff;
}

.interests-search-results {
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid #e0e0e0;
}

.interests-categories {
  margin-top: 10px;
}

.interest-category {
  margin-bottom: 15px;
}

.category-button {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 15px;
  background: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
  color: #333;
}

.category-button:hover {
  background: #e8f4fd;
  border-color: #409eff;
}

.category-button.expanded {
  background: #e8f4fd;
  border-color: #409eff;
}

.category-icon {
  font-size: 18px;
  margin-right: 8px;
}

.category-name {
  flex: 1;
  text-align: left;
  font-weight: 500;
}

.category-tags {
  margin-top: 12px;
  padding-left: 0;
}

.interests-hot-section,
.interests-more-section {
  margin-bottom: 20px;
}

.interests-section-title {
  font-size: 14px;
  font-weight: bold;
  color: #333;
  margin-bottom: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
}

.expand-icon {
  font-size: 12px;
  color: #999;
}

.interests-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  row-gap: 12px;
}

.interest-tag {
  display: inline-block;
  padding: 8px 16px;
  background: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 16px;
  font-size: 13px;
  color: #666;
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
  margin: 0;
}

.interest-tag:hover {
  background: #e8f4fd;
  border-color: #409eff;
  color: #409eff;
}

.interest-tag.selected {
  background: #4CAF50;
  border-color: #4CAF50;
  color: #fff;
  cursor: default;
}

.interest-tag.selected:hover {
  background: #45a049;
  border-color: #45a049;
}

.interest-tag.active {
  background: #409eff;
  border-color: #409eff;
  color: #fff;
}

.user-info-greeting-line {
  font-size: 14px;
  color: #848484;
  line-height: 1.4;
  margin-top: 8px;
}

.user-info-request-time {
  font-size: 14px;
  color: #848484;
  line-height: 1.4;
  margin-top: 6px;
}

.user-info-remark-hint {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #e0e0e0;
}

.remark-hint-text {
  font-size: 14px;
  color: #409eff;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 0.2s;
  display: inline-block;
}

.remark-hint-text:hover {
  background: #e3f2fd;
}

.block-friend-text {
  font-size: 14px;
  color: #f56c6c;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 0.2s;
  display: inline-block;
}

.block-friend-text:hover {
  background: #ffeaea;
}

.user-info-request-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid #e0e0e0;
  flex-shrink: 0;
}

.message-avatar.avatar-clickable {
  cursor: pointer;
  transition: transform 0.2s;
}

.message-avatar.avatar-clickable:hover {
  transform: scale(1.1);
}

/* 备注相关样式 */
.user-info-remark {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #e0e0e0;
}

.remark-display {
  display: flex;
  align-items: center;
  gap: 8px;
}

.remark-label {
  font-size: 14px;
  color: #666;
  font-weight: 500;
}

.remark-value {
  font-size: 14px;
  color: #333;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 0.2s;
  flex: 1;
}

.remark-value:hover {
  background: #f0f0f0;
}

.remark-value:empty::before {
  content: '添加备注名';
  color: #999;
}

.remark-edit {
  display: flex;
  align-items: center;
  gap: 8px;
}

.user-info-add-friend {
  margin-top: 12px;
  margin-left: -120px;
  width: calc(100% + 120px);
}

.user-info-divider {
  width: 100%;
  height: 1px;
  background: #e0e0e0;
  margin: 12px 0 12px 0;
}

.user-info-block-friend {
  margin-top: 12px;
  margin-left: -120px;
}

.user-info-send-message {
  margin-left: -120px;
  width: calc(100% + 120px);
}

.user-info-delete-friend {
  margin-left: -120px;
  width: calc(100% + 120px);
}

.full-width {
  width: 100%;
}

.remark-input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid #409eff;
  border-radius: 4px;
  font-size: 14px;
  outline: none;
}

.remark-input:focus {
  border-color: #409eff;
}

.remark-edit-buttons {
  display: flex;
  gap: 5px;
}

.remark-save-btn,
.remark-cancel-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: background 0.2s;
  flex-shrink: 0;
}

.remark-save-btn {
  background: #67c23a;
  color: #fff;
}

.remark-save-btn:hover {
  background: #5daf34;
}

.remark-cancel-btn {
  background: #f56c6c;
  color: #fff;
}

.remark-cancel-btn:hover {
  background: #dd6161;
}

/* AI好友设置样式 */
.user-info-setting-item {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #e0e0e0;
}

.user-info-setting-item:first-child {
  margin-top: 0;
  padding-top: 0;
  border-top: none;
}

.user-info-setting-item label {
  display: block;
  font-size: 14px;
  color: #666;
  margin-bottom: 8px;
}

.setting-value {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
}

.setting-value span {
  font-size: 14px;
  color: #333;
  flex: 1;
}

.edit-btn {
  background: transparent;
  border: 1px solid #409eff;
  color: #409eff;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.edit-btn:hover {
  background: #409eff;
  color: #fff;
}

.setting-edit {
  display: flex;
  align-items: center;
  gap: 8px;
}

.setting-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.setting-input:focus {
  border-color: #409eff;
}

.setting-edit-buttons {
  display: flex;
  gap: 4px;
}

.setting-save-btn,
.setting-cancel-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.setting-save-btn {
  background: #67c23a;
  color: #fff;
}

.setting-save-btn:hover {
  background: #529b2e;
}

.setting-cancel-btn {
  background: #f56c6c;
  color: #fff;
}

.setting-cancel-btn:hover {
  background: #dd6161;
}

.ai-friend-type-select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
  background: #fff;
  cursor: pointer;
}

.ai-friend-type-select:focus {
  border-color: #409eff;
}

.user-info-ai-type {
  font-size: 14px;
  color: #666;
  margin-top: 8px;
}

/* Toast 消息提示样式 */
.toast {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: #333;
  color: #fff;
  padding: 12px 24px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 10000;
  font-size: 14px;
  animation: toastSlideIn 0.3s ease-out;
  max-width: 400px;
  word-wrap: break-word;
}

.toast-success {
  background: #67c23a;
}

.toast-error {
  background: #f56c6c;
}

@keyframes toastSlideIn {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

/* 转发消息相关样式 */
.forward-modal {
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.forward-modal .modal-body {
  flex: 1;
  overflow: hidden;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.forward-preview {
  margin-bottom: 20px;
  padding: 12px;
  background: #f5f5f5;
  border-radius: 8px;
}

.forward-preview-label {
  font-size: 14px;
  color: #666;
  margin-bottom: 8px;
}

.forward-preview-content {
  background: #fff;
  padding: 12px;
  border-radius: 6px;
  border: 1px solid #e0e0e0;
}

.message-text-preview {
  color: #333;
  line-height: 1.4;
}

.message-image-preview img {
  max-width: 200px;
  max-height: 150px;
  border-radius: 4px;
}

.message-file-preview {
  display: flex;
  align-items: center;
  gap: 8px;
}

.forward-target-list {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
}

.forward-target-item {
  display: flex;
  align-items: center;
  padding: 12px;
  cursor: pointer;
  border-bottom: 1px solid #f0f0f0;
  transition: background 0.2s;
}

.forward-target-item:last-child {
  border-bottom: none;
}

.forward-target-item:hover {
  background: #f5f5f5;
}

.forward-target-item.active {
  background: #e3f2fd;
}

.forward-target-info {
  margin-left: 12px;
}

.forward-target-name {
  font-weight: 500;
  color: #333;
}

.forward-target-type {
  font-size: 12px;
  color: #999;
}

/* 收藏夹相关样式 */
.favorites-categories {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-bottom: 1px solid #e0e0e0;
}

.favorite-category-btn {
  padding: 10px 16px;
  border: none;
  background: #f5f5f5;
  color: #333;
  border-radius: 4px;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s;
  font-size: 14px;
}

.favorite-category-btn:hover {
  background: #e8e8e8;
}

.favorite-category-btn.active {
  background: #409eff;
  color: #fff;
}

.favorites-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

.favorites-header {
  padding: 15px;
  border-bottom: 1px solid #e0e0e0;
  flex-shrink: 0;
}

.favorites-header h3 {
  margin: 0;
  font-size: 18px;
  color: #333;
}

.favorites-list {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
}

.empty-favorites {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
}

.favorite-item {
  position: relative;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  overflow: visible;
  transition: all 0.2s;
}

.favorite-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.favorite-image-item {
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: visible;
  border-radius: 8px;
}

.favorite-image-item img {
  border-radius: 8px 8px 0 0;
}

.favorite-image-item .favorite-item-source,
.favorite-image-item .favorite-item-time {
  padding: 0 12px 12px 12px;
}

.favorite-image-item img {
  max-width: 100%;
  max-height: 400px;
  width: auto;
  height: auto;
  display: block;
  cursor: pointer;
  margin: 0 auto;
}

.favorite-file-item {
  padding: 12px;
  display: flex;
  flex-direction: column;
}

.favorite-file-header {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.favorite-file-icon {
  font-size: 24px;
  flex-shrink: 0;
}

.favorite-file-info {
  flex: 1;
  min-width: 0;
}

.favorite-file-name {
  font-size: 14px;
  color: #333;
  word-break: break-word;
  margin-bottom: 4px;
}

.favorite-file-size {
  font-size: 12px;
  color: #999;
}

.favorite-file-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.download-btn,
.remove-btn {
  padding: 4px 8px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.2s;
}

.download-btn {
  background: #409eff;
  color: #fff;
}

.download-btn:hover {
  background: #337ecc;
}

.remove-btn {
  background: #f56c6c;
  color: #fff;
}

.remove-btn:hover {
  background: #dd6161;
}

.favorite-message-item {
  padding: 12px;
  display: flex;
  flex-direction: column;
  min-height: auto;
}

.favorite-message-content {
  font-size: 14px;
  color: #333;
  line-height: 1.5;
  margin-bottom: 8px;
  word-break: break-word;
  white-space: pre-wrap;
  overflow: visible;
}

.favorite-other-item {
  padding: 12px;
}

.favorite-other-content {
  font-size: 14px;
  color: #333;
  word-break: break-word;
  margin-bottom: 8px;
}

.favorite-item-source {
  font-size: 12px;
  color: #666;
  margin-top: 8px;
  margin-bottom: 4px;
  flex-shrink: 0;
}

.favorite-item-time {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
  margin-bottom: 8px;
  flex-shrink: 0;
}

/* 多选消息相关样式 */
.message-checkbox {
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 10;
}


.message-item {
  position: relative;
}

/* 多选模式下，消息项向右移动，为复选框腾出空间 */
.message-item.multi-select-mode {
  padding-left: 32px;
}

/* 多选模式下，选中消息的背景样式 */
.message-item.multi-select-mode.selected {
  background: #e3f2fd;
  border-radius: 8px;
  margin: 4px 0;
  padding-top: 8px;
  padding-bottom: 8px;
}

/* 消息复选框样式 - 类似发起群聊弹窗的样式 */
.message-checkbox-circle {
  width: 20px;
  height: 20px;
  border: 2px solid #ddd;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  cursor: pointer;
  background: #fff;
}

.message-checkbox-circle.checked {
  background: #409eff;
  border-color: #409eff;
  color: #fff;
}

.message-checkbox-circle.checked span {
  font-size: 12px;
  font-weight: bold;
}

.message-checkbox-circle:hover {
  border-color: #409eff;
}

.multi-select-actions {
  display: flex;
  gap: 10px;
  width: 100%;
  padding: 8px 0;
}

.cancel-multi-select-btn {
  padding: 8px 16px;
  background: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  color: #333;
  transition: background 0.2s;
}

.cancel-multi-select-btn:hover {
  background: #e8e8e8;
}

.forward-multi-btn {
  flex: 1;
  padding: 8px 16px;
  background: #007bff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  color: #fff;
  transition: background 0.2s;
}

.forward-multi-btn:hover:not(:disabled) {
  background: #0056b3;
}

.forward-multi-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.favorite-multi-btn {
  flex: 1;
  padding: 8px 16px;
  background: #28a745;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  color: #fff;
  transition: background 0.2s;
}

.favorite-multi-btn:hover:not(:disabled) {
  background: #218838;
}

.favorite-multi-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

/* 选择收藏弹窗样式 */
.select-favorite-modal {
  max-width: 600px;
  width: 90%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.select-favorite-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: row;
  min-height: 0;
}

.select-favorite-categories {
  width: 150px;
  flex-shrink: 0;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-right: 1px solid #e0e0e0;
  overflow-y: auto;
}

.select-favorites-list {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
}

.select-favorite-item {
  position: relative;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.select-favorite-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.select-favorite-checkbox {
  flex-shrink: 0;
  margin-top: 4px;
}

.select-favorite-item .favorite-image-item,
.select-favorite-item .favorite-file-item,
.select-favorite-item .favorite-message-item,
.select-favorite-item .favorite-other-item {
  flex: 1;
  margin: 0;
  border: none;
  padding: 0;
}

/* 多选转发模态框样式 */
.multi-forward-modal {
  max-width: 600px;
  width: 90%;
}

.forward-chat-title {
  font-size: 16px;
  font-weight: 600;
  color: #333;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e0e0e0;
}

.forward-messages-list {
  max-height: 300px;
  overflow-y: auto;
  margin-bottom: 20px;
  padding-right: 8px;
}

.forward-messages-list::-webkit-scrollbar {
  width: 8px;
}

.forward-messages-list::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 4px;
}

.forward-messages-list::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 4px;
}

.forward-messages-list::-webkit-scrollbar-thumb:hover {
  background: #555;
}

.forward-message-item {
  display: flex;
  gap: 12px;
  padding: 12px;
  border-bottom: 1px solid #f0f0f0;
}

.forward-message-item:last-child {
  border-bottom: none;
}

.forward-message-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #e0e0e0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 14px;
  color: #666;
}

.forward-message-content {
  flex: 1;
  min-width: 0;
}

.forward-message-text {
  color: #333;
  line-height: 1.5;
  word-wrap: break-word;
}

.forward-message-forwarded {
  background: #f5f5f5;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  transition: background 0.2s;
}

.forward-message-forwarded:hover {
  background: #eeeeee;
}

.forward-message-forwarded .forwarded-message-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  margin-bottom: 8px;
}

.forward-message-forwarded .forwarded-message-preview {
  font-size: 12px;
  color: #666;
  display: flex;
  align-items: center;
  gap: 4px;
}

.forward-message-forwarded .forwarded-message-preview::before {
  content: '📋';
  font-size: 14px;
}

.forward-message-image img {
  max-width: 200px;
  max-height: 150px;
  border-radius: 4px;
}

.forward-message-file {
  color: #333;
  display: flex;
  align-items: center;
  gap: 8px;
}

.forward-message-unknown {
  color: #999;
  font-style: italic;
}

/* 转发消息显示样式 */
.forwarded-message-card {
  background: #f5f5f5;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  transition: background 0.2s;
  margin: 4px 0;
}

.forwarded-message-card:hover {
  background: #eeeeee;
}

.forwarded-message-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  margin-bottom: 8px;
}

.forwarded-message-preview {
  font-size: 12px;
  color: #666;
  display: flex;
  align-items: center;
  gap: 4px;
}

.forwarded-message-preview::before {
  content: '📋';
  font-size: 14px;
}

/* 群公告相关样式 */
.announcement-textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  min-height: 200px;
  box-sizing: border-box;
}

.announcement-textarea:focus {
  outline: none;
  border-color: #007bff;
}

/* 查找聊天记录相关样式 */
.search-history-modal {
  max-width: 800px;
  width: 90%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.search-history-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  padding: 20px;
}

.search-history-search {
  margin-bottom: 15px;
}

.search-history-input {
  width: 100%;
  padding: 10px 15px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
}

.search-history-input:focus {
  border-color: #409eff;
  box-shadow: 0 0 0 3px rgba(64, 158, 255, 0.1);
}

.search-history-filters {
  display: flex;
  gap: 10px;
  margin-bottom: 15px;
  flex-wrap: wrap;
}

.filter-btn {
  padding: 6px 16px;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  background: #fff;
  color: #333;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.filter-btn:hover {
  background: #f5f5f5;
  border-color: #409eff;
}

.filter-btn.active {
  background: #409eff;
  color: #fff;
  border-color: #409eff;
}

.search-history-list {
  flex: 1;
  overflow-y: auto;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 10px;
}

.search-history-loading,
.search-history-empty {
  text-align: center;
  padding: 40px 20px;
  color: #999;
  font-size: 14px;
}

.search-history-item {
  display: flex;
  gap: 12px;
  padding: 12px;
  border-bottom: 1px solid #f0f0f0;
  align-items: flex-start;
}

.search-history-item:last-child {
  border-bottom: none;
}

.search-history-item:hover {
  background: #f9f9f9;
}

.search-history-avatar {
  width: 40px;
  height: 40px;
  min-width: 40px;
  min-height: 40px;
  border-radius: 50%;
  background: #409eff;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: bold;
  flex-shrink: 0;
  overflow: hidden;
}

.search-history-avatar.ai-friend-avatar {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  font-size: 20px;
}

.search-history-content {
  flex: 1;
  min-width: 0;
}

.search-history-sender {
  font-size: 13px;
  font-weight: 500;
  color: #333;
  margin-bottom: 4px;
}

.search-history-text {
  font-size: 14px;
  color: #666;
  line-height: 1.5;
  word-wrap: break-word;
  word-break: break-word;
}

.search-history-image img {
  max-width: 200px;
  max-height: 150px;
  border-radius: 6px;
  cursor: pointer;
  object-fit: contain;
}

.search-history-file {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.search-history-time {
  font-size: 12px;
  color: #999;
  white-space: nowrap;
  flex-shrink: 0;
  margin-top: 2px;
}

/* 日期选择器样式 */
.date-filter-wrapper {
  position: relative;
  display: inline-block;
}

.date-picker-dropdown {
  position: fixed;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 15px;
  background: #fff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1001;
  min-width: 300px;
}

.date-picker-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-bottom: 15px;
}

.date-nav-btn {
  width: 32px;
  height: 32px;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.date-nav-btn:hover {
  background: #f5f5f5;
  border-color: #409eff;
}
.date-select {
  padding: 6px 10px;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  font-size: 14px;
  outline: none;
  cursor: pointer;
}

.date-select:focus {
  border-color: #409eff;
}

.date-picker-calendar {
  width: 100%;
}

.date-picker-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
  margin-bottom: 8px;
}

.weekday {
  text-align: center;
  font-size: 12px;
  color: #666;
  font-weight: 500;
  padding: 8px 0;
}

.date-picker-days {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}

.date-day {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
  position: relative;
}

.date-day.other-month {
  color: #ccc;
}

.date-day.has-message {
  color: #333;
  font-weight: 500;
}

.date-day:not(.has-message):not(.other-month) {
  color: #999;
}

.date-day:hover:not(.other-month) {
  background: #f0f0f0;
}

.date-day.selected {
  background: #409eff;
  color: #fff;
  font-weight: bold;
}

.date-day.has-message:not(.selected):not(.other-month):hover {
  background: #e3f2fd;
}

/* 发起群聊弹窗样式 */
.create-group-modal {
  max-width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.create-group-body {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.group-avatar-upload {
  display: flex;
  align-items: center;
  gap: 12px;
}

.group-avatar-preview,
.group-avatar-placeholder {
  width: 60px;
  height: 60px;
  border-radius: 8px;
  background: #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  color: #999;
  flex-shrink: 0;
}

.group-avatar-preview {
  background-size: cover;
  background-position: center;
}

.create-group-contacts-list {
  max-height: 300px;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  padding: 8px;
}

.create-group-contact-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

.create-group-contact-item:hover {
  background: #f5f5f5;
}

.contact-checkbox {
  flex-shrink: 0;
}

.checkbox-circle {
  width: 20px;
  height: 20px;
  border: 2px solid #ddd;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.checkbox-circle.checked {
  background: #409eff;
  border-color: #409eff;
  color: #fff;
}

.checkbox-circle.checked span {
  font-size: 12px;
  font-weight: bold;
}

.contact-avatar-small {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  color: #999;
  flex-shrink: 0;
}

.contact-name {
  flex: 1;
  font-size: 14px;
  color: #333;
}

.empty-contacts {
  text-align: center;
  padding: 20px;
  color: #999;
  font-size: 14px;
}

/* 群聊信息弹窗样式 */
.group-info-modal {
  max-width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.group-info-body {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding: 20px;
}

.group-info-header {
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e0e0e0;
}

.group-info-title {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.group-name-display {
  font-size: 16px;
  font-weight: 600;
  color: #333;
  line-height: 1.5;
}

.group-id-display {
  font-size: 14px;
  color: #666;
  line-height: 1.5;
}

.group-members-grid {
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 12px;
  margin-top: 10px;
}

.group-member-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: transform 0.2s;
}

.group-member-item:hover {
  transform: scale(1.05);
}

.group-member-avatar {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: #999;
  flex-shrink: 0;
}

.group-member-avatar.avatar-clickable {
  cursor: pointer;
  transition: transform 0.2s;
}

.group-member-avatar.avatar-clickable:hover {
  transform: scale(1.05);
}

.group-member-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 100%;
}

.group-member-name {
  font-size: 12px;
  color: #333;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
}

.group-member-match-field {
  font-size: 10px;
  color: #999;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
}

.group-member-owner {
  font-size: 10px;
  color: #999;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
}

.group-member-admin {
  font-size: 10px;
  color: #999;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
}

.group-member-admin {
  font-size: 10px;
  color: #999;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
}

.group-info-avatar-section {
  display: flex;
  align-items: center;
  gap: 12px;
}

.group-info-avatar {
  width: 80px;
  height: 80px;
  border-radius: 8px;
  background: #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  color: #999;
  transition: all 0.2s;
  border: 2px solid #e0e0e0;
}

.group-info-avatar.avatar-clickable {
  cursor: pointer;
}

.group-info-avatar.avatar-clickable:hover {
  border-color: #409eff;
  background: #f5f5f5;
  transform: scale(1.05);
}

.group-info-name-section,
.group-info-remark-section,
.group-info-nickname-section {
  margin-top: 8px;
}

.group-info-name-display,
.group-info-remark-display,
.group-info-nickname-display {
  padding: 8px 12px;
  background: #f5f5f5;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  min-height: 20px;
}

.group-info-name-display:hover,
.group-info-remark-display:hover,
.group-info-nickname-display:hover {
  background: #eaeaea;
}

.group-info-name-edit,
.group-info-remark-edit,
.group-info-nickname-edit {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.group-info-name-actions,
.group-info-remark-actions,
.group-info-nickname-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.btn.secondary {
  background: #f5f5f5;
  color: #333;
}

.btn.secondary:hover {
  background: #eaeaea;
}

.btn.danger {
  background: #f56c6c;
  color: #fff;
}

.btn.danger:hover {
  background: #dd6161;
}

.btn.send-message-btn {
  background: #409eff;
  color: #fff;
}

.btn.send-message-btn:hover {
  background: #337ecc;
}

.modal-btn.danger-btn {
  background: #f56c6c;
  color: #fff;
}

.modal-btn.danger-btn:hover {
  background: #dd6161;
}

.group-info-icon {
  width: 20px;
  height: 20px;
}

.group-info-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  border-radius: 4px;
}

.group-info-btn:hover {
  background: #f0f0f0;
}

.empty-contacts {
  text-align: center;
  padding: 20px;
  color: #999;
  font-size: 14px;
}

.settings-modal-overlay {
  z-index: 1003;
}

.settings-modal-content {
  width: 800px;
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.settings-body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.settings-sidebar {
  width: 200px;
  background: #f5f5f5;
  border-right: 1px solid #e0e0e0;
  padding: 20px 0;
  overflow-y: auto;
}

.settings-menu-item {
  padding: 12px 20px;
  cursor: pointer;
  color: #333;
  transition: background-color 0.2s;
}

.settings-menu-item:hover {
  background: #e8e8e8;
}

.settings-menu-item.active {
  background: #409eff;
  color: #fff;
}

.settings-content {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

.blacklist-content {
  height: 100%;
}

.empty-blacklist {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: #999;
}

.blacklist-list {
  display: flex;
  flex-direction: column;
}

.blacklist-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.blacklist-item:hover {
  background: #f5f5f5;
}
</style>