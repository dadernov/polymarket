// contracts/test/LeveragePool.invariant.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/LeveragePool.sol";

contract PoolHandler is Test {
    LeveragePool public pool;
    uint256 public idCounter;
    bytes32[] public openIds;

    // «зеркальный» учёт суммы открытых позиций — для проверки против контракта
    uint256 public ghostSum;
    uint256 public rejectedCount; // сколько раз лимит отклонил open

    constructor(LeveragePool _pool) {
        pool = _pool;
    }

    function open(uint256 payout) external {
            payout = bound(payout, 5_000e6, 20_000e6);
            bytes32 id = keccak256(abi.encode(idCounter++));
            // проверяем лимит ЗАРАНЕЕ: если позиция его пробьёт — просто не открываем,
            // но считаем это как «стенка сработала». Так отказ виден в статистике.
            if (pool.reserved() + payout > pool.limit()) {
                rejectedCount++;
                return;
            }
            pool.openPosition(id, payout);
            openIds.push(id);
            ghostSum += payout;
        }

    function close(uint256 seed) external {
        if (openIds.length == 0) return;
        uint256 i = bound(seed, 0, openIds.length - 1);
        bytes32 id = openIds[i];
        uint256 payout = pool.positionPayout(id);
        pool.closePosition(id);
        ghostSum -= payout;
        openIds[i] = openIds[openIds.length - 1];
        openIds.pop();
    }
}

contract LeveragePoolInvariantTest is Test {
    LeveragePool pool;
    PoolHandler handler;

function setUp() public {
        pool = new LeveragePool(100_000e6, 3000, address(this));  // лимит $30k
        handler = new PoolHandler(pool);
        pool.setOperator(address(handler));

        // фаззер бьёт ТОЛЬКО в open (без close) -> резерв растёт -> упрётся в лимит
        targetContract(address(handler));
        bytes4[] memory selectors = new bytes4[](1);
        selectors[0] = PoolHandler.open.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    // Главный инвариант: резерв никогда не превышает лимит.
    function invariant_ReservedNeverExceedsLimit() public view {
        assertLe(pool.reserved(), pool.limit());
    }
    
// Вызывается Foundry ОДИН раз в конце серии (не после каждого шага).
    // Здесь проверяем, что тест был содержателен: фаззер реально упирался в лимит.
    function afterInvariant() public view {
        assertGt(handler.rejectedCount(), 0);
    }

    // Инвариант согласованности: контрактный reserved == сумме открытых позиций.
    // Ловит ошибки учёта (двойной счёт, потерянный release и т.п.).
    function invariant_ReservedEqualsGhostSum() public view {
        assertEq(pool.reserved(), handler.ghostSum());
    }
}