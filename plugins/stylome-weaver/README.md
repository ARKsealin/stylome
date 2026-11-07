# stylome-weaver

作者风格锚定与比对。你提供一组样本——自己满意的作品，或想对齐的某位作者——它训练出一份文风画像；之后任何文本都能逐段对照画像，把偏离落在原文片段上，给出方向性的修改意见。

画像让风格从一种感觉变成一组可度量的分布：九轴风格指纹（雷达）、关键词指纹、逐段偏离档位（越带 / 关注 / 轻微偏离 / 在带内）。修改意见按画像带外预算（α）组织——对齐画像的调整与有意突破画像的尝试分开报告，突破由作者自己确认。

## 快速开始

```text
/weaver train <样本文件夹> [作者名]      建立 / 更新画像（文件夹内 .txt / .md 批量训练）
/weaver compare <画像id> <文件路径>      逐段校验 + 修改意见
/weaver profiles                         查看已有画像
/weaver doctor                           运行条件体检
```

画像存放在用户级目录 `~/.stylome-weaver/profiles/`，随训练持续积累。侧栏「StylomeWeaver」面板提供九轴雷达、逐段热力与画像卡片的可视化。

工具入口：`stylome_weaver_train` / `stylome_weaver_compare` / `stylome_weaver_profiles` / `stylome_weaver_doctor`。

## 初始化

出厂携带空白画像库，第一次 `train` 就是你自己的锚定画像。样本越丰富、覆盖越广，画像越稳。

## 自检

`/weaver doctor` 检查 node / Python / jieba 桥；`node verify.mjs` 用一段内置文本走完「测量 → 学画像 → 九轴指纹 → 逐段校验」全链路。

## 许可

代码以 [MIT](../../LICENSE) 分发。
