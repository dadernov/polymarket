// contracts/test/Settlement.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/Settlement.sol";
import "../src/ConditionalTokens.sol";
import "../src/MockUSDC.sol";

contract SettlementTest is Test {
    MockUSDC usdc;
    ConditionalTokens ct;
    Settlement settlement;

    address alice; uint256 alicePk; // продавец YES
    address bob;   uint256 bobPk;   // покупатель YES
    address oracle = makeAddr("oracle");
    bytes32 constant M = keccak256("market-eip712");

    function setUp() public {
        (alice, alicePk) = makeAddrAndKey("alice"); // адрес + известный приватный ключ
        (bob, bobPk) = makeAddrAndKey("bob");

        usdc = new MockUSDC();
        ct = new ConditionalTokens(IERC20(address(usdc)), oracle);
        settlement = new Settlement(ct, IERC20(address(usdc)));

        // alice: получает 2 YES через split и разрешает Settlement двигать её позиции
        usdc.mint(alice, 2e6);
        vm.startPrank(alice);
        usdc.approve(address(ct), 2e6);
        ct.splitPosition(M, 2e6);
        ct.setApprovalForAll(address(settlement), true);
        vm.stopPrank();

        // bob: получает $1.20 и разрешает Settlement их тратить
        usdc.mint(bob, 1_200_000);
        vm.prank(bob);
        usdc.approve(address(settlement), 1_200_000);
    }

    function _sign(uint256 pk, Settlement.Order memory o) internal view returns (bytes memory) {
        bytes32 digest = settlement.hashOrder(o);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest); // подпись приватным ключом
        return abi.encodePacked(r, s, v);
    }

    function _orders() internal view returns (Settlement.Order memory buyO, Settlement.Order memory sellO) {
        sellO = Settlement.Order({
            maker: alice, marketId: M, outcome: 0, side: 1,
            price: 600_000, amount: 2e6, nonce: 1, expiry: block.timestamp + 1 days
        });
        buyO = Settlement.Order({
            maker: bob, marketId: M, outcome: 0, side: 0,
            price: 600_000, amount: 2e6, nonce: 1, expiry: block.timestamp + 1 days
        });
    }

    // 2 YES по $0.60 = $1.20 меняются атомарно
    function test_Settle_SwapsAtomically() public {
        (Settlement.Order memory buyO, Settlement.Order memory sellO) = _orders();
        bytes memory sigBuy = _sign(bobPk, buyO);
        bytes memory sigSell = _sign(alicePk, sellO);
        bytes32 yesId = ct.positionId(M, ConditionalTokens.Outcome.YES);

        settlement.settle(buyO, sigBuy, sellO, sigSell, 2e6);

        assertEq(ct.balanceOf(yesId, bob), 2e6, "bob got YES");
        assertEq(ct.balanceOf(yesId, alice), 0, "alice gave YES");
        assertEq(usdc.balanceOf(alice), 1_200_000, "alice got $1.20");
        assertEq(usdc.balanceOf(bob), 0, "bob paid $1.20");
    }

    // ту же подпись нельзя проиграть повторно
    function test_Settle_NoReplay() public {
        (Settlement.Order memory buyO, Settlement.Order memory sellO) = _orders();
        bytes memory sigBuy = _sign(bobPk, buyO);
        bytes memory sigSell = _sign(alicePk, sellO);

        settlement.settle(buyO, sigBuy, sellO, sigSell, 2e6);

        vm.expectRevert("buy overfilled");
        settlement.settle(buyO, sigBuy, sellO, sigSell, 1);
    }

    // подпись не того человека отклоняется
    function test_Settle_BadSignatureReverts() public {
        (Settlement.Order memory buyO, Settlement.Order memory sellO) = _orders();
        bytes memory sigBuy = _sign(bobPk, buyO);
        bytes memory sigSellWrong = _sign(bobPk, sellO); // sell подписал bob, а не alice

        vm.expectRevert("bad sell sig");
        settlement.settle(buyO, sigBuy, sellO, sigSellWrong, 2e6);
    }
}