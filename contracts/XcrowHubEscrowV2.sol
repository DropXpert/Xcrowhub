// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title XcrowHubEscrowV2
 * @notice Non-custodial, single-token escrow for XcrowHub USDT deals.
 *
 * Each on-chain escrow key is derived from a private-deal reference and the
 * funding buyer. Copying a pending funding transaction from the public mempool
 * therefore produces a different key for the copier and cannot reserve or
 * block the legitimate buyer's escrow.
 *
 * The contract deliberately has no owner, upgrade hook, rescue function, or
 * arbitrary withdrawal path. XcrowHub is only one of three authorized
 * settlement signers and cannot move deal principal by itself.
 */
contract XcrowHubEscrowV2 is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant MAX_FEE_BPS = 100; // 1%

    bytes32 public constant SETTLEMENT_TYPEHASH = keccak256(
        "Settlement(bytes32 escrowKey,uint256 buyerAmount,uint256 sellerAmount,uint256 nonce,uint256 deadline)"
    );

    enum EscrowState {
        None,
        Funded,
        Settled
    }

    struct Escrow {
        address buyer;
        address seller;
        uint256 amount;
        uint256 nonce;
        uint16 feeBps;
        EscrowState state;
    }

    IERC20 public immutable token;
    address public immutable arbitrator;
    address public immutable treasury;

    mapping(bytes32 escrowKey_ => Escrow escrow) public escrows;

    event EscrowFunded(
        bytes32 indexed escrowKey,
        address indexed buyer,
        address indexed seller,
        uint256 amount,
        uint16 feeBps
    );

    event SettlementExecuted(
        bytes32 indexed escrowKey,
        address indexed buyer,
        address indexed seller,
        uint256 buyerAmount,
        uint256 sellerAmount,
        uint256 feeAmount,
        address executor
    );

    error AlreadyFunded();
    error DealNotFunded();
    error InvalidAddress();
    error InvalidAmount();
    error InvalidFee();
    error InvalidSettlement();
    error InvalidSigner();
    error DuplicateSigner();
    error SignatureExpired();
    error Unauthorized();

    constructor(IERC20 token_, address arbitrator_, address treasury_)
        EIP712("XcrowHub Escrow", "2")
    {
        if (
            address(token_) == address(0)
                || arbitrator_ == address(0)
                || treasury_ == address(0)
        ) {
            revert InvalidAddress();
        }
        token = token_;
        arbitrator = arbitrator_;
        treasury = treasury_;
    }

    /**
     * @notice Returns the buyer-bound storage key for a deal reference.
     */
    function escrowKey(bytes32 dealReference, address buyer)
        public
        pure
        returns (bytes32)
    {
        if (dealReference == bytes32(0)) revert InvalidSettlement();
        if (buyer == address(0)) revert InvalidAddress();
        return keccak256(abi.encode(dealReference, buyer));
    }

    /**
     * @notice Locks an exact amount of USDT for one buyer-bound deal.
     * @dev The buyer must approve this contract before calling. `dealReference`
     * is not used directly as the mapping key, preventing copied transactions
     * from reserving another buyer's escrow.
     */
    function fund(
        bytes32 dealReference,
        address seller,
        uint256 amount,
        uint16 feeBps
    ) external nonReentrant {
        if (
            seller == address(0)
                || seller == msg.sender
                || seller == address(this)
                || seller == treasury
        ) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (feeBps > MAX_FEE_BPS) revert InvalidFee();

        bytes32 key = escrowKey(dealReference, msg.sender);
        Escrow storage escrow = escrows[key];
        if (escrow.state != EscrowState.None) revert AlreadyFunded();

        escrow.buyer = msg.sender;
        escrow.seller = seller;
        escrow.amount = amount;
        escrow.feeBps = feeBps;
        escrow.state = EscrowState.Funded;

        token.safeTransferFrom(msg.sender, address(this), amount);
        emit EscrowFunded(key, msg.sender, seller, amount, feeBps);
    }

    /**
     * @notice Buyer confirms delivery and releases the fixed full amount.
     */
    function release(bytes32 dealReference) external nonReentrant {
        bytes32 key = escrowKey(dealReference, msg.sender);
        Escrow storage escrow = _fundedEscrow(key);
        _finalize(key, escrow, 0, escrow.amount);
    }

    /**
     * @notice Seller voluntarily refunds the fixed full amount.
     */
    function refund(bytes32 dealReference, address buyer)
        external
        nonReentrant
    {
        bytes32 key = escrowKey(dealReference, buyer);
        Escrow storage escrow = _fundedEscrow(key);
        if (msg.sender != escrow.seller) revert Unauthorized();
        _finalize(key, escrow, escrow.amount, 0);
    }

    /**
     * @notice Executes a full or split outcome authorized by any two parties.
     */
    function settle(
        bytes32 dealReference,
        address buyer,
        uint256 buyerAmount,
        uint256 sellerAmount,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signatureA,
        bytes calldata signatureB
    ) external nonReentrant {
        bytes32 key = escrowKey(dealReference, buyer);
        Escrow storage escrow = _fundedEscrow(key);
        if (deadline < block.timestamp) revert SignatureExpired();
        if (nonce != escrow.nonce) revert InvalidSettlement();
        if (
            buyerAmount + sellerAmount != escrow.amount
                || (buyerAmount == 0 && sellerAmount == 0)
        ) {
            revert InvalidSettlement();
        }

        bytes32 digest = settlementDigest(
            key,
            buyerAmount,
            sellerAmount,
            nonce,
            deadline
        );
        address signerA = ECDSA.recover(digest, signatureA);
        address signerB = ECDSA.recover(digest, signatureB);

        if (signerA == signerB) revert DuplicateSigner();
        if (!_isAuthorizedSigner(escrow, signerA)) revert InvalidSigner();
        if (!_isAuthorizedSigner(escrow, signerB)) revert InvalidSigner();

        _finalize(key, escrow, buyerAmount, sellerAmount);
    }

    function settlementDigest(
        bytes32 key,
        uint256 buyerAmount,
        uint256 sellerAmount,
        uint256 nonce,
        uint256 deadline
    ) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    SETTLEMENT_TYPEHASH,
                    key,
                    buyerAmount,
                    sellerAmount,
                    nonce,
                    deadline
                )
            )
        );
    }

    function _fundedEscrow(bytes32 key)
        private
        view
        returns (Escrow storage escrow)
    {
        escrow = escrows[key];
        if (escrow.state != EscrowState.Funded) revert DealNotFunded();
    }

    function _isAuthorizedSigner(Escrow storage escrow, address signer)
        private
        view
        returns (bool)
    {
        return signer == escrow.buyer
            || signer == escrow.seller
            || signer == arbitrator;
    }

    function _finalize(
        bytes32 key,
        Escrow storage escrow,
        uint256 buyerAmount,
        uint256 sellerAmount
    ) private {
        uint256 feeAmount;
        // Preserve XcrowHub's current fee rule: the marketplace fee applies
        // only to a complete seller release, never to refunds or split outcomes.
        if (buyerAmount == 0 && sellerAmount == escrow.amount) {
            feeAmount = (sellerAmount * escrow.feeBps) / 10_000;
        }
        uint256 sellerNet = sellerAmount - feeAmount;

        escrow.state = EscrowState.Settled;
        escrow.nonce += 1;

        if (buyerAmount != 0) token.safeTransfer(escrow.buyer, buyerAmount);
        if (sellerNet != 0) token.safeTransfer(escrow.seller, sellerNet);
        if (feeAmount != 0) token.safeTransfer(treasury, feeAmount);

        emit SettlementExecuted(
            key,
            escrow.buyer,
            escrow.seller,
            buyerAmount,
            sellerAmount,
            feeAmount,
            msg.sender
        );
    }
}
