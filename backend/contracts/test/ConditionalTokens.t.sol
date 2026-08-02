// contracts/test/ConditionalTokens.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ConditionalTokens.sol";
import "../src/MockUSDC.sol";

contract ConditionalTokensTest is Test {
    MockUSDC usdc;
    ConditionalTokens ct;

    address user = makeAddr("user");
    address oracle = makeAddr("oracle");
    bytes32 constant M = keccak256("will-it-rain-tomorrow");

    function setUp() public {
        usdc = new MockUSDC();
        ct = new ConditionalTokens(IERC20(address(usdc)), oracle);
        usdc.mint(user, 100e6); // $100 тестовых (6 знаков)
    }

    function _yes() internal view returns (bytes32) {
        return ct.positionId(M, ConditionalTokens.Outcome.YES);
    }
    function _no() internal view returns (bytes32) {
        return ct.positionId(M, ConditionalTokens.Outcome.NO);
    }

    function test_Split_MintsPair() public {
        vm.startPrank(user);
        usdc.approve(address(ct), 1e6);
        ct.splitPosition(M, 1e6);
        vm.stopPrank();

        assertEq(ct.balanceOf(_yes(), user), 1e6, "YES minted");
        assertEq(ct.balanceOf(_no(), user), 1e6, "NO minted");
        assertEq(usdc.balanceOf(address(ct)), 1e6, "collateral locked");
        assertEq(usdc.balanceOf(user), 99e6, "user paid exactly $1");
    }

    function test_Merge_ReturnsCollateral() public {
        vm.startPrank(user);
        usdc.approve(address(ct), 1e6);
        ct.splitPosition(M, 1e6);
        ct.mergePositions(M, 1e6);
        vm.stopPrank();

        assertEq(usdc.balanceOf(user), 100e6, "fully refunded");
        assertEq(usdc.balanceOf(address(ct)), 0, "nothing locked");
        assertEq(ct.balanceOf(_yes(), user), 0);
        assertEq(ct.balanceOf(_no(), user), 0);
    }

    function test_Invariant_CollateralBacksEveryPair(uint256 a, uint256 b) public {
        a = bound(a, 1, 50e6);
        b = bound(b, 1, 50e6);

        vm.startPrank(user);
        usdc.approve(address(ct), a + b);
        ct.splitPosition(M, a);
        ct.splitPosition(M, b);
        vm.stopPrank();

        (, , uint256 pairSupply) = ct.markets(M);
        assertEq(pairSupply, a + b, "pairSupply counts every split");
        assertEq(usdc.balanceOf(address(ct)), pairSupply, "1 collateral behind 1 pair");
    }

    function test_ResolveRedeem_YesWins() public {
        vm.startPrank(user);
        usdc.approve(address(ct), 5e6);
        ct.splitPosition(M, 5e6); // -$5; на руках 5 YES + 5 NO
        vm.stopPrank();

        vm.prank(oracle);
        ct.reportPayouts(M, true);

        vm.prank(user);
        ct.redeemPositions(M); // +$5 за YES

        assertEq(usdc.balanceOf(user), 100e6, "YES paid 1:1");
        assertEq(usdc.balanceOf(address(ct)), 0, "collateral drained exactly");
    }

    function test_OnlyOracle_CanResolve() public {
        vm.prank(user);
        vm.expectRevert("only oracle");
        ct.reportPayouts(M, true);
    }

    // прямой перевод позиции самим владельцем
    function test_TransferPosition_Direct() public {
        address other = makeAddr("other");
        vm.startPrank(user);
        usdc.approve(address(ct), 3e6);
        ct.splitPosition(M, 3e6);                       // 3 YES + 3 NO
        ct.transferPosition(user, other, _yes(), 2e6);  // отдать 2 YES
        vm.stopPrank();

        assertEq(ct.balanceOf(_yes(), user), 1e6);
        assertEq(ct.balanceOf(_yes(), other), 2e6);
    }

    // одобренный оператор двигает чужие позиции; посторонний — нет
    function test_TransferPosition_Operator() public {
        address other = makeAddr("other");
        address operator = makeAddr("operator");
        bytes32 yesId = ct.positionId(M, ConditionalTokens.Outcome.YES); // считаем ДО prank

        vm.startPrank(user);
        usdc.approve(address(ct), 3e6);
        ct.splitPosition(M, 3e6);
        ct.setApprovalForAll(operator, true);           // разрешаю оператору
        vm.stopPrank();

        vm.prank(operator);
        ct.transferPosition(user, other, yesId, 2e6);   // prank идёт прямо на этот вызов
        assertEq(ct.balanceOf(yesId, other), 2e6);

        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        vm.expectRevert("not approved");
        ct.transferPosition(user, other, yesId, 1e6);
    }
}

