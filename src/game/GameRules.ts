import { Ball, BallType } from './objects/Ball';

export enum BallGroup {
  NONE = 'none',
  SOLIDS = 'solids',
  STRIPES = 'stripes'
}

export enum Player {
  ONE = 1,
  TWO = 2
}

export interface GameState {
  currentPlayer: Player;
  player1Group: BallGroup;
  player2Group: BallGroup;
  isFoul: boolean;
  canPlaceCueBall: boolean;
  gameOver: boolean;
  winner: Player | null;
  message: string;
  isFirstBreak: boolean;
}

/**
 * Правила игры в американский пул (8-ball)
 * 
 * Размещение битка:
 * - После фола → в любом месте стола
 * - В остальных случаях → биток остаётся где остановился
 */
export class GameRules {
  private state: GameState;
  private pocketedThisTurn: Ball[] = [];
  private cueBallPocketedThisTurn: boolean = false;
  private turnInProgress: boolean = false;
  private firstContactBall: Ball | null = null;

  constructor() {
    this.state = this.createInitialState();
  }

  /**
   * Создаёт начальное состояние игры
   */
  private createInitialState(): GameState {
    return {
      currentPlayer: Player.ONE,
      player1Group: BallGroup.NONE,
      player2Group: BallGroup.NONE,
      isFoul: false,
      canPlaceCueBall: false,
      gameOver: false,
      winner: null,
      message: 'Игрок 1: Разбейте пирамиду!',
      isFirstBreak: true
    };
  }

  /**
   * Возвращает копию текущего состояния игры
   */
  public getState(): GameState {
    return { ...this.state };
  }

  /**
   * Обработчик начала хода
   */
  public onTurnStart(): void {
    if (this.turnInProgress) {
      console.warn('⚠️ Turn already in progress');
      return;
    }

    console.log('🎯 Turn start');
    this.turnInProgress = true;
    this.pocketedThisTurn = [];
    this.cueBallPocketedThisTurn = false;
    this.state.isFoul = false;
    this.firstContactBall = null;
  }

  /**
   * Обработчик забивания битка
   */
  public onCueBallPocketed(): void {
    if (!this.turnInProgress) {
      console.warn('⚠️ Cue ball pocketed outside of turn');
      return;
    }

    this.cueBallPocketedThisTurn = true;
    this.state.isFoul = true;
    this.state.canPlaceCueBall = true;
    console.log('⚠️ Фол: Биток забит!');
  }

  /**
   * Обработчик забивания шара
   */
  public onBallPocketed(ball: Ball): void {
    if (!this.turnInProgress) {
      console.warn('⚠️ Ball pocketed outside of turn, starting implicit turn');
      this.onTurnStart();
    }

    if (ball.getType() === BallType.CUE) {
      this.onCueBallPocketed();
      return;
    }

    if (this.pocketedThisTurn.find(b => b.getNumber() === ball.getNumber())) {
      console.warn(`⚠️ Ball ${ball.getNumber()} already counted`);
      return;
    }

    this.pocketedThisTurn.push(ball);
    console.log(`🎯 Ball ${ball.getNumber()} pocketed`);
  }

  /**
   * 🆕 Вызывается при столкновении битка с шаром
   */
  public onCueBallContact(ball: Ball): void {
    // Игнорируем если ход не начат
    if (!this.turnInProgress) {
      console.warn('⚠️ Contact detected outside of turn');
      return;
    }

    // Запоминаем ТОЛЬКО первый контакт
    if (this.firstContactBall === null && ball.getType() === BallType.NUMBERED) {
      this.firstContactBall = ball;
      console.log(`🎯 First contact registered: ball ${ball.getNumber()}`);
    }
  }

  /**
  * Обработчик окончания хода
  */
  public onTurnEnd(allBalls: Ball[]): void {
    if (!this.turnInProgress) {
      console.warn('⚠️ Turn end called but no turn in progress');
      return;
    }

    console.log(`🏁 Turn end for Player ${this.state.currentPlayer}`);
    console.log(`   First contact: ${this.firstContactBall ? `Ball ${this.firstContactBall.getNumber()}` : 'NONE'}`);
    console.log(`   Pocketed: [${this.pocketedThisTurn.map(b => b.getNumber()).join(', ')}]`);

    this.turnInProgress = false;

    if (this.state.gameOver) return;

    const eightBallPocketed = this.pocketedThisTurn.some(b => b.getNumber() === 8);

    if (eightBallPocketed) {
      this.handleEightBallPocketed(allBalls);
      return;
    }

    if (this.state.isFirstBreak) {
      this.handleFirstBreak();
      return;
    }

    // 🆕 ПРОВЕРКА ПЕРВОГО КОНТАКТА (только если группы назначены)
    if (this.state.player1Group !== BallGroup.NONE) {
      if (!this.checkFirstContactLegality(allBalls)) {
        this.state.isFoul = true;
        this.state.canPlaceCueBall = true;

        // Определяем причину фола
        if (!this.firstContactBall) {
          this.state.message = `❌ Фол! Биток не коснулся шаров`;
        } else {
          this.state.message = `❌ Фол! Первый контакт с чужим шаром`;
        }

        this.switchPlayer();
        return;
      }
    }

    // Назначение групп
    if (this.state.player1Group === BallGroup.NONE && this.pocketedThisTurn.length > 0) {
      this.assignGroups();
    }

    // Фол: биток в лузу
    if (this.cueBallPocketedThisTurn) {
      this.state.message = `❌ Фол! Биток в лузу`;
      this.switchPlayer();
      return;
    }

    // Промах
    if (this.pocketedThisTurn.length === 0) {
      this.state.message = `Мимо`;
      this.switchPlayer();
      return;
    }

    // Проверка забитых шаров
    const currentGroup = this.getCurrentPlayerGroup();
    const allOwnBalls = this.pocketedThisTurn.every(ball =>
      this.getBallGroup(ball.getNumber()) === currentGroup
    );

    if (allOwnBalls && currentGroup !== BallGroup.NONE) {
      this.state.message = `✅ Отлично! Продолжайте`;
    } else {
      this.state.message = `❌ Чужой шар в лузу`;
      this.switchPlayer();
    }
  }

  /**
   * Проверяет легальность первого контакта
   */
  private checkFirstContactLegality(allBalls: Ball[]): boolean {
    // Фол: биток вообще ничего не коснулся
    if (!this.firstContactBall) {
      console.warn('⚠️ No contact with any ball');
      return false;
    }

    const currentGroup = this.getCurrentPlayerGroup();

    // Если группа не определена → любой контакт легален
    if (currentGroup === BallGroup.NONE) {
      return true;
    }

    // Проверяем наличие своих шаров на столе
    const ownBallsRemaining = allBalls.some(ball =>
      !ball.isPocketedState() &&
      ball.getType() === BallType.NUMBERED &&
      ball.getNumber() !== 8 &&
      this.getBallGroup(ball.getNumber()) === currentGroup
    );

    console.log(`🔍 First contact check:`, {
      contact: this.firstContactBall.getNumber(),
      currentGroup: currentGroup,
      ownBallsRemaining: ownBallsRemaining
    });

    // Все свои шары забиты → можно бить только 8-ку
    if (!ownBallsRemaining) {
      if (this.firstContactBall.getNumber() === 8) {
        console.log('  ✅ Legal: hitting 8-ball (all own balls pocketed)');
        return true;
      } else {
        console.log('  ❌ Foul: must hit 8-ball');
        return false;
      }
    }

    // Свои шары есть → нельзя бить 8-ку
    if (this.firstContactBall.getNumber() === 8) {
      console.log('  ❌ Foul: hit 8-ball too early');
      return false;
    }

    // Первый контакт должен быть со своим шаром
    const contactGroup = this.getBallGroup(this.firstContactBall.getNumber());
    const isLegal = contactGroup === currentGroup;

    if (isLegal) {
      console.log(`  ✅ Legal: hit own ball ${this.firstContactBall.getNumber()}`);
    } else {
      console.log(`  ❌ Foul: hit opponent's ball ${this.firstContactBall.getNumber()}`);
    }

    return isLegal;
  }

  /**
   * Обработка первого разбития
   */
  private handleFirstBreak(): void {
    this.state.isFirstBreak = false;

    if (this.cueBallPocketedThisTurn) {
      this.state.message = `Фол при разбитии! Биток в лузу`;
      this.switchPlayer();
      return;
    }

    if (this.pocketedThisTurn.length > 0) {
      this.state.message = `Удачное разбитие! Продолжайте`;
    } else {
      this.state.message = `Разбитие выполнено`;
      this.switchPlayer();
    }
  }

  /**
   * Обработчик забивания восьмёрки
   */
  private handleEightBallPocketed(allBalls: Ball[]): void {
    const currentGroup = this.getCurrentPlayerGroup();

    const ownBallsRemaining = allBalls.some(ball =>
      !ball.isPocketedState() &&
      ball.getType() === BallType.NUMBERED &&
      ball.getNumber() !== 8 &&
      this.getBallGroup(ball.getNumber()) === currentGroup
    );

    if (ownBallsRemaining || this.cueBallPocketedThisTurn) {
      this.state.gameOver = true;
      this.state.winner = this.state.currentPlayer === Player.ONE ? Player.TWO : Player.ONE;
      this.state.message = `🏆 Игрок ${this.state.winner} победил! (Фол на восьмёрке)`;
    } else {
      this.state.gameOver = true;
      this.state.winner = this.state.currentPlayer;
      this.state.message = `🏆 Игрок ${this.state.winner} победил!`;
    }
  }

  /**
   * Распределяет группы между игроками
   */
  private assignGroups(): void {
    const firstBall = this.pocketedThisTurn[0];
    const group = this.getBallGroup(firstBall.getNumber());

    if (this.state.currentPlayer === Player.ONE) {
      this.state.player1Group = group;
      this.state.player2Group = group === BallGroup.SOLIDS ? BallGroup.STRIPES : BallGroup.SOLIDS;
    } else {
      this.state.player2Group = group;
      this.state.player1Group = group === BallGroup.SOLIDS ? BallGroup.STRIPES : BallGroup.SOLIDS;
    }

    console.log(`👥 Groups assigned: P1=${this.state.player1Group}, P2=${this.state.player2Group}`);
  }

  /**
   * Определяет группу шара по номеру
   */
  private getBallGroup(ballNumber: number): BallGroup {
    if (ballNumber === 8) return BallGroup.NONE;
    return ballNumber <= 7 ? BallGroup.SOLIDS : BallGroup.STRIPES;
  }

  /**
   * Возвращает группу текущего игрока
   */
  private getCurrentPlayerGroup(): BallGroup {
    return this.state.currentPlayer === Player.ONE
      ? this.state.player1Group
      : this.state.player2Group;
  }

  /**
   * Переключает игрока
   */
  private switchPlayer(): void {
    const oldPlayer = this.state.currentPlayer;
    this.state.currentPlayer = this.state.currentPlayer === Player.ONE ? Player.TWO : Player.ONE;
    this.state.canPlaceCueBall = false;
    console.log(`🔄 Player switched: ${oldPlayer} → ${this.state.currentPlayer}`);
  }

  /**
   * Возвращает сообщение для начала хода (не изменяет state.message!)
   */
  public getTurnStartMessage(): string {
    if (this.state.gameOver) {
      return this.state.message;
    }

    if (this.state.canPlaceCueBall) {
      return `🎯 Разместите биток`;
    }

    if (this.state.isFirstBreak) {
      return `Игрок ${this.state.currentPlayer}: Разбейте пирамиду!`;
    }

    const currentGroup = this.getCurrentPlayerGroup();
    if (currentGroup === BallGroup.NONE) {
      return `Игрок ${this.state.currentPlayer}: Выберите группу`;
    }

    const groupName = currentGroup === BallGroup.SOLIDS ? 'Сплошные' : 'Полосатые';
    return `Игрок ${this.state.currentPlayer} (${groupName}): Ваш ход`;
  }

  /**
   * Сброс игры
   */
  public resetGame(): void {
    this.turnInProgress = false;
    this.pocketedThisTurn = [];
    this.cueBallPocketedThisTurn = false;
    this.state = this.createInitialState();
  }

  /**
   * Подтверждение размещения битка
   */
  public cueBallPlaced(): void {
    this.state.canPlaceCueBall = false;
    this.state.message = this.getTurnStartMessage();
  }
}