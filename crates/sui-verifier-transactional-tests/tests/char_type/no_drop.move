// Copyright (c) 2022, Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// invalid, char type has no drop ability

//# init --addresses test=0x0

//# publish
module test::m {

    struct M { }

    fun init(t: M, _: &mut sui::tx_context::TxContext) {
        let M { } = t;
    }
}
