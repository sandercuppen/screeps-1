#ScreepsAI

通过代码操控creep和各种设施来推进游戏，每个tick都会跑一遍你上传的的代码。

Screeps基本单位为creep，还有各种设施。

creep可以理解为可以通过代码操控的小兵，可以移动，包含各种行为，如：攻击，治疗，修理和建造等。

##目的

游戏的目的基本上只有一个，阔张/守护领土。

但由于官方提供了各个数据的排行，所以刷榜也会是一些玩家的目标。

另外还会有一些限时争霸赛，几个玩家在一个较小区域内角逐最后的生存者。

不管是何种目的，都要求代码的运行结果是追求效率的，并且有的还需要考虑突发的甚至多变的情况。

## 策略

策略模型是游戏中控制各个对象进行游戏资源累计的关键。比如资源策略的决策结果决定了如何安排那些与资源采集运输等事情有关的分配和调整。策略的准确性决定了玩家达到目的的效率，越准确则效率越高，越节省时间。

### 有限状态机

计算机就是一个大的状态机

官方教学里中的模式是简单的硬编码if语句来安排creep进行各种任务。而每个if语句其实就代表了一个状态，if里的代码块就是到达每个状态后需要执行的动作/行为。

**优点**	这是最最简单的策略模型，可以很容易的被理解和扩展。

**缺点**	参数是完全硬编码的，为了能够达到期望的效率，需要不停的观察调整参数。

**总结**	有限状态机可以用于具体的任务执行时的状态管理，而不是决策。

### 动态规划

在有限状态机的基础上进行改良，将多个状态机综合在一起考虑。可以一定程度上的满足需求，也容易被扩展。

其思想是分析整个游戏进程中可能遇到的状态，将之罗列并一一设计应对的方法。

如，房间状态 = 房间等级 + 能量存储等级 + 设施建造等级 + 防御等级 + 威胁等级。

其中涉及到各个等级参数又都是由一个个小的状态机转变而成。最后用生成的房间状态决定采取相应的策略。

**优点**	通过维护一个很大的多级状态转换表，可以清晰地控制各种想要的情况。

**缺点**	状态转换表会变得越来越大，越来越复杂，最终可能会出现难以添加新状态的局面。

**总结**	一定阶段之前是很好的选择，在相当的设计之后需要考虑更加灵活的策略模型，而不是依靠硬编码。

### 能效系统

待编辑



##全局约定 - 要素说明

每一份screeps代码都会有一套属于自己的约定，这套约定表达了程序设计者的思想和想表达的意图/侧重点。

而约定的好坏也决定了编码的难易程度。原则上，约定越少灵活性越高，编码的时候思路就越清晰，越有条理，并且可发挥的空间更发。

本项目的目标是，尽可能的定制大的全局约定，只进行必要的关键的约定。本书也会描述这些约定的作用和价值。

而约定的内容会统一用以下的格式来排版：

>### 约定 - xxx
>
>约定内容xxx



###global	

`global`全局变量，可以当做运行时环境，凡是他的成员或方法都可以在游戏内直接调用，类似浏览器中的window变量。

。

官方推出了isolate模式，即“`global`会在每天0点或代码更新的时候被清空（还原）”。所以global会被还原的情况一般只有两种可能：上传了新的代码和每天0点。

所以我们可以很大程度上的利用这个特点，让代码大多数时间都跑在内存中，而非每次都经过序列化和反序列化过程（这个过程相当耗时）。由于这个考量我们做出如下约定：

>### 约定 - 数据层与数据读写
>
>凡是可以实例化到内存中的数据，全部进行实例化。
>
>数据读操作优先用内存中读，查无果再从内存中进行实例化。
>
>设计数据管理模型：
>
>1. MemoryCache		对于Memory的管理
>2. RuntimeCache		对于内存实例对象的管理
>3. TickCache			对于单帧缓存的管理
>
>数据管理框架：Manager
>
>每个可实例化的数据类型都对应一个唯一的Manager，Manager则使用以上三个数据管理模型对不同情况时的数据进行维护。



#### 运行时环境被还原

`hasRoot`，`hasRoom`

用`hasRoot`变量来判断是否被还原，不存在或为false的时候执行一遍全局`init`方法，重新挂载需要的扩展和方法。

```flow
s=>start: Start
e=>end: Next Tick
Loop=>subroutine: Loop:>./Loop.md

s(right)->Loop(right)->e
e(right)->Loop
```



### Cache → [Link](./cache.md)

### Clock → [Link](./Clock.md)



###扩展约定

每个实例化对象都有`UUID`，`raw`属性。

每个基类都用`existCheckKeyArray`属性。

####UUID 

UUID使用两个 0-9 a-Z的36进制字符串组成，前为随机变量，后为时间戳。所有实例化对象都有

#### paramsList

该属性为一个数组，存贮了需要输出到Memory的属性键名。这些属性用于恢复实例化对象

####existCheckKeyArray

字符串数组，用于校验对象的在管理器字典中是否已经存在，字符串表示对象的属性名。所有实例化对象的基类都有。

#### raw

字面量对象，即嵌套的属性中，最终都是字面量，不存在循环引用。使用paramsList生成，用于存储在Memory中，也用来进行对象实例化。所有实例化对象都有。

**仅输出用于实例化的属性，或者需要用于恢复实例化的属性**

### event - 事件

有很多地方需要用到事件的回调机制，但是程序中不存续这么做，只能遍历所有对象判断事件是否发生。



[#reboot](./reboot.md)
