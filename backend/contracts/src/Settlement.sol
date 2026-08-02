// contracts/src/Settlement.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ConditionalTokens.sol";

// Атомарный своп по двум подписанным ордерам (EIP-712).
// Матчер СВОДИТ и предлагает; этот контракт ПРОВЕРЯЕТ подписи/условия и ИСПОЛНЯЕТ.
contract Settlement {
    struct Order {
        address maker;
        bytes32 marketId;
        uint8 outcome;   // 0 = YES, 1 = NO
        uint8 side;      // 0 = BUY (даёт коллатерал, берёт токены), 1 = SELL (наоборот)
        uint256 price;   // цена за 1 токен, в единицах коллатерала; ONE = $1.00
        uint256 amount;  // сколько токенов подписал maker (максимум к исполнению)
        uint256 nonce;   // уникальность ордера
        uint256 expiry;  // до какого времени валиден
    }

    uint256 public constant ONE = 1e6; // 6 знаков, как USDC

    ConditionalTokens public immutable ct;
    IERC20 public immutable collateral;
    bytes32 public immutable DOMAIN_SEPARATOR;

    bytes32 public constant ORDER_TYPEHASH = keccak256(
        "Order(address maker,bytes32 marketId,uint8 outcome,uint8 side,uint256 price,uint256 amount,uint256 nonce,uint256 expiry)"
    );

    // сколько уже исполнено по каждому ордеру (ключ = его EIP-712 дайджест) — защита от повтора
    mapping(bytes32 => uint256) public filled;

    event Settled(bytes32 indexed buyDigest, bytes32 indexed sellDigest, uint256 amount, uint256 price, uint256 cost);

    constructor(ConditionalTokens _ct, IERC20 _collateral) {
        ct = _ct;
        collateral = _collateral;
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes("PredmarketSettlement")),
            keccak256(bytes("1")),
            block.chainid,
            address(this)
        ));
    }

    // EIP-712 дайджест ордера. Ровно его подписывает кошелёк off-chain.
    function hashOrder(Order calldata o) public view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(
            ORDER_TYPEHASH, o.maker, o.marketId, o.outcome, o.side, o.price, o.amount, o.nonce, o.expiry
        ));
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
    }

    function settle(
        Order calldata buy, bytes calldata sigBuy,
        Order calldata sell, bytes calldata sigSell,
        uint256 fillAmount
    ) external {
        require(fillAmount > 0, "fill=0");
        require(buy.side == 0 && sell.side == 1, "side mismatch");
        require(buy.marketId == sell.marketId && buy.outcome == sell.outcome, "market mismatch");
        require(buy.price >= sell.price, "price cross"); // покупатель платит не меньше, чем просит продавец
        require(block.timestamp <= buy.expiry, "buy expired");
        require(block.timestamp <= sell.expiry, "sell expired");

        bytes32 buyDigest = hashOrder(buy);
        bytes32 sellDigest = hashOrder(sell);
        require(_recover(buyDigest, sigBuy) == buy.maker, "bad buy sig");
        require(_recover(sellDigest, sigSell) == sell.maker, "bad sell sig");

        require(filled[buyDigest] + fillAmount <= buy.amount, "buy overfilled");
        require(filled[sellDigest] + fillAmount <= sell.amount, "sell overfilled");
        // effects ДО external calls (checks-effects-interactions)
        filled[buyDigest] += fillAmount;
        filled[sellDigest] += fillAmount;

        uint256 execPrice = sell.price; // maker-цена продавца
        uint256 cost = fillAmount * execPrice / ONE;

        bytes32 posId = ct.positionId(sell.marketId, ConditionalTokens.Outcome(sell.outcome));
        ct.transferPosition(sell.maker, buy.maker, posId, fillAmount);          // токены: продавец -> покупатель
        require(collateral.transferFrom(buy.maker, sell.maker, cost), "collateral"); // $: покупатель -> продавец

        emit Settled(buyDigest, sellDigest, fillAmount, execPrice, cost);
    }

    // восстановить адрес подписанта из 65-байтной подписи (r ‖ s ‖ v)
    function _recover(bytes32 digest, bytes memory sig) internal pure returns (address) {
        require(sig.length == 65, "sig len");
        bytes32 r; bytes32 s; uint8 v;
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        return ecrecover(digest, v, r, s);
    }
}