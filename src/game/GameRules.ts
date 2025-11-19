import { Ball } from './objects/Ball';

export enum Player { ONE = 1, TWO = 2 }

export interface GameState {
  currentPlayer: Player;
  scoreP1: number;
  scoreP2: number;
  message: string;
  canPlaceCueBall: boolean; // Можно ли двигать шар рукой
  isBreakShot: boolean;     // Является ли ход начальным ударом (разбоем)
  gameOver: boolean;
  winner: Player | null;
}

/**
 * Класс правил игры "Свободная пирамида" (Американка).
 * Цель: первым забить 8 шаров.
 * Особенности: 
 * 1. Любой шар может быть битком (кроме разбоя).
 * 2. За любой забитый шар дается очко.
 * 3. Штрафы пока опущены для простоты.
 */
export class GameRules {
  private state!: GameState;
  private pocketedCountTurn: number = 0;
  
  private readonly WIN_SCORE = 8;

  constructor() {
    this.resetGame();
  }

  public onTurnStart(): void {
    this.pocketedCountTurn = 0;
    // Сообщение зависит от фазы
    if (this.state.isBreakShot) {
        this.state.message = `Игрок ${this.state.currentPlayer}: Разбой пирамиды! Переместите шар в "Дом".`;
    } else {
        this.state.message = `Игрок ${this.state.currentPlayer}: Выберите шар для удара.`;
    }
  }

  public onBallPocketed(_ball: Ball): void {
    // В свободке любой шар приносит очко
    this.pocketedCountTurn++;
  }

  public onTurnEnd(): void {
    if (this.state.gameOver) return;

    const points = this.pocketedCountTurn;
    
    // Если были забиты шары
    if (points > 0) {
        this.addScore(points);
        this.state.message = `Забито: ${points}. Продолжайте ход!`;
        
        // Если был забит шар при разбое, следующий удар уже не считается разбоем,
        // но игрок продолжает серию.
        if (this.state.isBreakShot) {
            this.state.isBreakShot = false;
        }
        
        // Биток рукой ставить нельзя (если только не вылетел, но это пока не обрабатываем)
        this.state.canPlaceCueBall = false;
    } 
    else {
        // Промах
        this.state.message = "Промах. Переход хода.";
        this.switchPlayer();
        
        // Если промахнулись на разбое (не забили), разбой считается завершенным,
        // дальше играем любым шаром.
        if (this.state.isBreakShot) {
            this.state.isBreakShot = false;
        }
        
        this.state.canPlaceCueBall = false;
    }

    this.checkWin();
  }

  /**
   * Вызывается, когда игрок закончил перемещать биток рукой и готов бить
   */
  public cueBallPlaced(): void {
      this.state.canPlaceCueBall = false;
      this.state.message = `Ход игрока ${this.state.currentPlayer}`;
  }

  private addScore(points: number): void {
    if (this.state.currentPlayer === Player.ONE) {
        this.state.scoreP1 += points;
    } else {
        this.state.scoreP2 += points;
    }
  }

  private switchPlayer(): void {
    this.state.currentPlayer = this.state.currentPlayer === Player.ONE ? Player.TWO : Player.ONE;
  }

  private checkWin(): void {
      if (this.state.scoreP1 >= this.WIN_SCORE) {
          this.state.gameOver = true;
          this.state.winner = Player.ONE;
          this.state.message = "Победа Игрока 1!";
      } else if (this.state.scoreP2 >= this.WIN_SCORE) {
          this.state.gameOver = true;
          this.state.winner = Player.TWO;
          this.state.message = "Победа Игрока 2!";
      }
  }

  public getState(): GameState { return { ...this.state }; }
  
  public resetGame(): void {
      this.state = {
          currentPlayer: Player.ONE,
          scoreP1: 0,
          scoreP2: 0,
          message: 'Разбейте пирамиду! Переместите биток в зону дома.',
          canPlaceCueBall: true, // На старте перемещаем биток
          isBreakShot: true,     // Это первый удар
          gameOver: false,
          winner: null
      };
  }
}