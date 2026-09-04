# 产品说明

Distill 是个人语音资料库、Transcript 阅读器和 AI 笔记工作区。

## 第一阶段工作流

```text
M4A
 -> 导入
 -> 本地 Speech-to-Text
 -> 原始 Transcript
 -> AI Template
 -> 结构化笔记
 -> SQLite
 -> 桌面 UI
```

第 0 阶段实现了从导入到播放的最小闭环，并为 transcript 和 AI artifact 准备了数据模型。

## 第一版页面

- 资料库：录音列表、状态、日期、时长、导入操作、空状态。
- 日历：按录音创建日期展示哪些天有记录，并可查看当天录音。
- 录音详情：音频播放器、summary 区域、transcript 区域。
- Transcript 阅读器支持按 segment 人工修正文本，原始机器转写版本仍保留。
- AI 笔记 History 可切换历史版本，并可右键删除不需要的生成结果。
- 设置：STT model、DeepSeek provider 设置、watch folder 占位。

## 暂不实现

- Windows 录音
- 云同步
- 账号系统
- 向量搜索
- 说话人分离
- 富文本编辑
- 移动端应用
