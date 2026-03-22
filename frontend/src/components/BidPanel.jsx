import { useState } from "react";

export default function BidPanel({ currentBid, step, budget, onBid, onWithdraw, onPass, disabled = false }) {
    const suggested = Number(currentBid) + Number(step);

    const placeBid = () => {
        onBid(suggested);
    };

    return (
        <div className="flex flex-wrap items-center gap-3">
            <button
                className="primary-btn px-6 py-3"
                onClick={placeBid}
                disabled={disabled || suggested > budget}
            >
                Bid ₹{suggested.toFixed(2)} Cr (step {step} Cr)
            </button>
            <button className="ghost-btn" onClick={onWithdraw} disabled={disabled}>
                Withdraw
            </button>
            <button className="ghost-btn" onClick={onPass} disabled={disabled}>
                Pass
            </button>
            <span className="text-sm text-slate-400">Balance: ₹{budget?.toFixed(2)} Cr</span>
        </div>
    );
}
