// contracts/src/ConditionalTokens.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

// Минимальный бинарный Conditional Token для PoC.
// ИНВАРИАНТ: коллатерал в контракте == числу выпущенных пар (pairSupply).
contract ConditionalTokens {
    enum Outcome { YES, NO }

    struct Market {
        bool resolved;
        bool yesWins;
        uint256 pairSupply;
    }

    IERC20 public immutable collateral;
    address public oracle;

    mapping(bytes32 => Market) public markets;
    mapping(bytes32 => mapping(address => uint256)) public balanceOf; // positionId => account => bal

    // --- НОВОЕ: операторы, как в ERC-1155 (нужно для Settlement) ---
    mapping(address => mapping(address => bool)) public isApprovedForAll; // owner => operator => ok

    event Split(bytes32 indexed marketId, address indexed who, uint256 amount);
    event Merge(bytes32 indexed marketId, address indexed who, uint256 amount);
    event Resolved(bytes32 indexed marketId, bool yesWins);
    event Redeemed(bytes32 indexed marketId, address indexed who, uint256 payout);
    // --- НОВОЕ ---
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event PositionTransfer(bytes32 indexed positionId, address indexed from, address indexed to, uint256 amount);

    constructor(IERC20 _collateral, address _oracle) {
        collateral = _collateral;
        oracle = _oracle;
    }

    function positionId(bytes32 marketId, Outcome o) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(marketId, o));
    }

    function splitPosition(bytes32 marketId, uint256 amount) external {
        require(!markets[marketId].resolved, "resolved");
        require(collateral.transferFrom(msg.sender, address(this), amount), "collateral in");
        balanceOf[positionId(marketId, Outcome.YES)][msg.sender] += amount;
        balanceOf[positionId(marketId, Outcome.NO)][msg.sender] += amount;
        markets[marketId].pairSupply += amount;
        emit Split(marketId, msg.sender, amount);
    }

    function mergePositions(bytes32 marketId, uint256 amount) external {
        bytes32 yes = positionId(marketId, Outcome.YES);
        bytes32 no = positionId(marketId, Outcome.NO);
        require(balanceOf[yes][msg.sender] >= amount && balanceOf[no][msg.sender] >= amount, "balance");
        balanceOf[yes][msg.sender] -= amount;
        balanceOf[no][msg.sender] -= amount;
        markets[marketId].pairSupply -= amount;
        require(collateral.transfer(msg.sender, amount), "collateral out");
        emit Merge(marketId, msg.sender, amount);
    }

    function reportPayouts(bytes32 marketId, bool yesWins) external {
        require(msg.sender == oracle, "only oracle");
        require(!markets[marketId].resolved, "already resolved");
        markets[marketId].resolved = true;
        markets[marketId].yesWins = yesWins;
        emit Resolved(marketId, yesWins);
    }

    function redeemPositions(bytes32 marketId) external {
        Market storage m = markets[marketId];
        require(m.resolved, "not resolved");
        bytes32 winId = positionId(marketId, m.yesWins ? Outcome.YES : Outcome.NO);
        uint256 bal = balanceOf[winId][msg.sender];
        require(bal > 0, "nothing to redeem");
        balanceOf[winId][msg.sender] = 0;
        m.pairSupply -= bal;
        require(collateral.transfer(msg.sender, bal), "payout");
        emit Redeemed(marketId, msg.sender, bal);
    }

    // --- НОВОЕ: разрешить оператору (напр. Settlement) двигать мои позиции ---
    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    // --- НОВОЕ: перевод позиции. Двигать может сам владелец или одобренный оператор. ---
    // pairSupply НЕ меняется: это смена владельца существующих токенов, не эмиссия.
    function transferPosition(address from, address to, bytes32 positionId_, uint256 amount) external {
        require(from == msg.sender || isApprovedForAll[from][msg.sender], "not approved");
        require(balanceOf[positionId_][from] >= amount, "balance");
        balanceOf[positionId_][from] -= amount;
        balanceOf[positionId_][to] += amount;
        emit PositionTransfer(positionId_, from, to, amount);
    }
}