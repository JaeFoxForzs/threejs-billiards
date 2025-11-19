import { Ball, BallType } from './objects/Ball';

export enum Player { ONE = 1, TWO = 2 }

export interface GameState {
  currentPlayer: Player;
  scoreP1: number;
  scoreP2: number;
  message: string;
  canPlaceCueBall: boolean;
  gameOver: boolean;
  winner: Player | null;
}

export class GameRules {
  private state: GameState;
  private pocketedCountTurn: number = 0;
  private cueBallPocketed: boolean = false;
  
  private readonly WIN_SCORE = 8;

  constructor() {
    this.state = {
      currentPlayer: Player.ONE,
      scoreP1: 0,
      scoreP2: 0,
      message: 'Разбейте пирамиду!',
      canPlaceCueBall: false,
      gameOver: false,
      winner: null
    };
  }

  public onTurnStart(): void {
    this.pocketedCountTurn = 0;
    this.cueBallPocketed = false;
    this.state.message = `Ход игрока ${this.state.currentPlayer}`;
  }

  public onBallPocketed(ball: Ball): void {
    this.pocketedCountTurn++;
    if (ball.getType() === BallType.CUE) {
      this.cueBallPocketed = true;
    }
  }

  // Исправлено: _ball чтобы линтер не ругался на неиспользуемую переменную
  public onCueBallContact(_ball: Ball): void {
      // Заглушка
  }

  public onTurnEnd(): void {
    if (this.state.gameOver) return;

    let points = this.pocketedCountTurn;
    
    if (points > 0) {
        this.addScore(points);
        this.state.message = `Забито: ${points}. Продолжайте!`;
        
        if (this.cueBallPocketed) {
             this.state.canPlaceCueBall = true;
             this.state.message += " (Свояк! Поставьте биток)";
        }
    } else {
        this.state.message = "Мимо. Переход хода.";
        this.switchPlayer();
    }

    this.checkWin();
  }

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

  public getTurnStartMessage(): string {
      return this.state.message;
  }

  public getState(): GameState { return { ...this.state }; }
  
  public resetGame(): void {
      this.state = {
          currentPlayer: Player.ONE,
          scoreP1: 0,
          scoreP2: 0,
          message: 'Новая игра. Разбивайте!',
          canPlaceCueBall: false,
          gameOver: false,
          winner: null
      };
  }
}