# Asset Cutout Studio

Asset Cutout Studio 解决把白底素材总览图拆成多个透明底 PNG 的问题。

## 本机运行

```bash
cd /Users/duyu/thunder/t_project/team-wiki/tools/asset-cutout-studio
npm install
npm start
```

打开后把图片拖进去，或点击选择图片。应用会：

- 从图片边缘识别白色背景并转成透明；
- 按连通区域自动切出独立素材；
- 保留圆角、图标、人物卡片等内容本身；
- 导出每个透明 PNG 到你选择的文件夹。

## 参数

- `白底阈值`：背景偏灰、带阴影时调高；误删图片内部亮色时调低。
- `最小面积`：过滤小噪点；漏掉小图标时调低。
- `合并间距`：把距离很近的组件合成一个素材；红点角标、按钮阴影被拆开时调高。

## 打包给别人使用

```bash
cd /Users/duyu/thunder/t_project/team-wiki/tools/asset-cutout-studio
npm install
npm run dist:mac
```

也可以按芯片架构单独打包：

```bash
npm run dist:mac:arm64
npm run dist:mac:x64
```

打包产物会生成到 `dist/`：

- `Asset Cutout Studio-0.1.0-arm64.dmg`：Apple Silicon Mac 使用。
- `Asset Cutout Studio-0.1.0-x64.dmg`：Intel Mac 使用。
- `mac-arm64/Asset Cutout Studio.app` 和 `mac/Asset Cutout Studio.app`：未压缩的 app 版本。

把对应 `.dmg` 发给对方即可。因为当前没有 Apple Developer 签名，对方第一次打开可能会看到 macOS 安全提示；处理方式是右键 app 选择“打开”，或到“系统设置 → 隐私与安全性”允许打开。

## 注意

这个工具针对“白色背景上的多张素材总览图”设计。复杂照片级背景或物体紧贴在一起时，需要手动调整参数；如果内容之间没有明显留白，算法无法可靠判断边界。
