// contracts/src/LeveragePool.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Пул плечевого слоя: держит капитал и ЖЕЛЕЗНЫЙ инвариант лимита.
// Off-chain считает неттинг/тариф и ПРЕДЛАГАЕТ; контракт ПРОВЕРЯЕТ и исполняет.
// Инвариант: суммарный резерв (обязательства пула) <= капитал * лимит.
contract LeveragePool {
    address public operator;      // off-chain-сеттлер, предлагает позиции
    uint256 public capital;       // капитал пула (в микро-USDC, 6 знаков)
    uint256 public maxUtilBps;    // лимит утилизации в базисных пунктах (3000 = 30%)
    uint256 public reserved;      // сколько сейчас зарезервировано под позиции

    // per-position обязательство (max_payout), по id
    mapping(bytes32 => uint256) public positionPayout;

    event Reserved(bytes32 indexed id, uint256 payout, uint256 totalReserved);
    event Released(bytes32 indexed id, uint256 payout, uint256 totalReserved);

    modifier onlyOperator() {
        require(msg.sender == operator, "only operator");
        _;
    }

    constructor(uint256 _capital, uint256 _maxUtilBps, address _operator) {
        require(_maxUtilBps <= 10_000, "bps > 100%");
        capital = _capital;
        maxUtilBps = _maxUtilBps;
        operator = _operator;
    }

    // Сменить оператора. В PoC — открыто; в проде за этим стоит governance/таймлок.
    function setOperator(address _operator) external {
        require(msg.sender == operator, "only operator");
        operator = _operator;
    }

    // лимит в абсолютных единицах: капитал * лимит / 10000
    function limit() public view returns (uint256) {
        return capital * maxUtilBps / 10_000;
    }

    // Открыть позицию: зарезервировать её обязательство. Инвариант проверяется ЖЁСТКО.
    function openPosition(bytes32 id, uint256 payout) external onlyOperator {
        require(positionPayout[id] == 0, "id exists");
        require(payout > 0, "zero payout");
        uint256 newReserved = reserved + payout;
        require(newReserved <= limit(), "limit exceeded"); // <-- ИНВАРИАНТ
        reserved = newReserved;
        positionPayout[id] = payout;
        emit Reserved(id, payout, reserved);
    }

    // Закрыть/погасить позицию: освободить резерв.
    function closePosition(bytes32 id) external onlyOperator {
        uint256 payout = positionPayout[id];
        require(payout > 0, "no position");
        reserved -= payout;
        delete positionPayout[id];
        emit Released(id, payout, reserved);
    }
}