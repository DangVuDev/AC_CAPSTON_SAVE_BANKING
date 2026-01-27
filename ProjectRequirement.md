Yêu cầu sản phẩm (Functional Requirements)
1.1 Actors
Depositor (user): gửi tiền, tất toán, gia hạn.
Bank Admin: cấu hình sản phẩm tiết kiệm, nạp “liquidity vault” để trả lãi, pause.
1.2 Token
 
Dùng 1 ERC20 stablecoin mock (USDC-like, 6 decimals) hoặc ERC20 18 decimals.
1.3 Tính năng bắt buộc
Tạo gói tiết kiệm (Saving Plan)

    + tenorDays (kỳ hạn: 7/30/90/180…)
    + aprBps (lãi suất năm theo basis points, ví dụ 800 = 8%)
    + minDeposit, maxDeposit (optional)
    + earlyWithdrawPenaltyBps (phạt rút trước hạn)
    + enabled

Mở sổ tiết kiệm (Open Deposit Certificate)

    + User chọn plan + amount. Contract giữ token (principal).
    + Lưu: owner, planId, principal, startAt, maturityAt, status.

Tất toán đúng hạn (Withdraw at maturity)

   + Trả principal + interest
   + Interest tính theo công thức đơn giản (simple interest): interest = principal * aprBps * tenorSeconds / (365 days * 10000)
   + Lãi lấy từ liquidity vault (admin đã nạp token vào vault).

Rút trước hạn (Early withdraw)

    + Không trả full interest (hoặc chỉ trả 0)
    + Tính penalty: penalty = principal * penaltyBps / 10000
    + User nhận: principal - penalty
    + Penalty chảy vào feeReceiver hoặc vào vault.

Gia hạn (Renew / Roll-over)

    + Khi đến hạn, user có thể chọn:
    + Rút cả gốc + lãi
    + Hoặc rollover: gộp lãi vào gốc và mở kỳ mới (cùng plan hoặc plan khác)

Admin vault management

    + fundVault(amount) để nạp token trả lãi
    + withdrawVault(amount) (giới hạn) để rút bớt vốn (tuỳ policy)
    + setFeeReceiver(...)
    + pause/unpause

Events bắt buộc

   + PlanCreated/PlanUpdated
   + DepositOpened(depositId, owner, planId, principal, maturityAt)
   + Withdrawn(depositId, owner, principal, interest, isEarly)
   + Renewed(oldDepositId, newDepositId, newPrincipal)

Business Rules (giống ngân hàng truyền thống)

+ Mỗi “sổ” là NFT-like id (depositId). (ERC721 thật)