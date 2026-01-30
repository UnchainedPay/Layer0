package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	abciserver "github.com/cometbft/cometbft/abci/server"
	abci "github.com/cometbft/cometbft/abci/types"
	"github.com/cometbft/cometbft/libs/log"
)

// -----------------------------
// Minimal state (Commit 1)
// -----------------------------

type State struct {
	Height    int64            `json:"height"`
	Balances  map[string]int64 `json:"balances"`
	Delegates map[string]int64 `json:"delegates"` // key: delegator|validator -> amount
	Treasury  int64            `json:"treasury"`
	Params    ChainParams      `json:"params"`
}

type ChainParams struct {
	FeeBase        int64 `json:"fee_base"`         // minimum fee per tx
	FeeBurnBps     int64 `json:"fee_burn_bps"`     // basis points burned
	FeeTreasuryBps int64 `json:"fee_treasury_bps"` // basis points to treasury
}

type Tx struct {
	Type string `json:"type"`

	// transfer
	From   string `json:"from,omitempty"`
	To     string `json:"to,omitempty"`
	Amount int64  `json:"amount,omitempty"`

	// delegate
	Delegator string `json:"delegator,omitempty"`
	Validator string `json:"validator,omitempty"`

	Fee int64 `json:"fee"`
}

// -----------------------------
// ABCI App
// -----------------------------

type App struct {
	abci.BaseApplication
	mtx      sync.Mutex
	logger   log.Logger
	snapshot string
	state    State
}

func NewApp(logger log.Logger, snapshotPath string) *App {
	a := &App{logger: logger, snapshot: snapshotPath}
	a.loadOrInit()
	return a
}

func (a *App) loadOrInit() {
	a.mtx.Lock()
	defer a.mtx.Unlock()

	_ = os.MkdirAll(filepath.Dir(a.snapshot), 0o755)
	b, err := os.ReadFile(a.snapshot)
	if err == nil && len(b) > 0 {
		_ = json.Unmarshal(b, &a.state)
		if a.state.Balances == nil {
			a.state.Balances = map[string]int64{}
		}
		if a.state.Delegates == nil {
			a.state.Delegates = map[string]int64{}
		}
		if a.state.Params.FeeBase == 0 {
			a.state.Params = ChainParams{FeeBase: 1, FeeBurnBps: 7000, FeeTreasuryBps: 3000}
		}
		return
	}

	// genesis app-state
	a.state = State{
		Height:    0,
		Balances:  map[string]int64{"alice": 1_000_000, "bob": 1_000_000, "treasury": 0},
		Delegates: map[string]int64{},
		Treasury:  0,
		Params:    ChainParams{FeeBase: 1, FeeBurnBps: 7000, FeeTreasuryBps: 3000},
	}
	a.persist()
}

func (a *App) persist() {
	b, _ := json.MarshalIndent(a.state, "", "  ")
	_ = os.WriteFile(a.snapshot, b, 0o644)
}

func decodeTx(txBytes []byte) (Tx, error) {
	// We accept either raw JSON or base64(JSON).
	raw := bytes.TrimSpace(txBytes)
	if len(raw) == 0 {
		return Tx{}, fmt.Errorf("empty tx")
	}
	// if looks like base64 (no '{'), try decode
	if raw[0] != '{' {
		dec, err := base64.StdEncoding.DecodeString(string(raw))
		if err == nil && len(dec) > 0 {
			raw = bytes.TrimSpace(dec)
		}
	}
	var tx Tx
	if err := json.Unmarshal(raw, &tx); err != nil {
		return Tx{}, fmt.Errorf("bad json tx: %w", err)
	}
	return tx, nil
}

func (a *App) applyTx(tx Tx) error {
	fee := tx.Fee
	if fee < a.state.Params.FeeBase {
		return fmt.Errorf("fee too low: %d (min %d)", fee, a.state.Params.FeeBase)
	}

	switch tx.Type {
	case "transfer":
		if tx.From == "" || tx.To == "" {
			return fmt.Errorf("missing from/to")
		}
		if tx.Amount <= 0 {
			return fmt.Errorf("amount must be > 0")
		}
		if a.state.Balances[tx.From] < tx.Amount+fee {
			return fmt.Errorf("insufficient balance")
		}
		a.state.Balances[tx.From] -= (tx.Amount + fee)
		a.state.Balances[tx.To] += tx.Amount

	case "delegate":
		if tx.Delegator == "" || tx.Validator == "" {
			return fmt.Errorf("missing delegator/validator")
		}
		if tx.Amount <= 0 {
			return fmt.Errorf("amount must be > 0")
		}
		if a.state.Balances[tx.Delegator] < tx.Amount+fee {
			return fmt.Errorf("insufficient balance")
		}
		a.state.Balances[tx.Delegator] -= (tx.Amount + fee)
		key := tx.Delegator + "|" + tx.Validator
		a.state.Delegates[key] += tx.Amount

	default:
		return fmt.Errorf("unknown tx type: %s", tx.Type)
	}

	// fee split
	burn := (fee * a.state.Params.FeeBurnBps) / 10_000
	_ = burn // burned = removed from supply (implicit)
	toTreasury := fee - burn
	a.state.Treasury += toTreasury
	a.state.Balances["treasury"] += toTreasury

	return nil
}

// ------------- ABCI methods -------------

func (a *App) Info(_ abci.RequestInfo) abci.ResponseInfo {
	a.mtx.Lock()
	defer a.mtx.Unlock()
	return abci.ResponseInfo{
		Data:             "layer0-hub-chain",
		Version:          "0.1.0",
		LastBlockHeight:  a.state.Height,
		LastBlockAppHash: []byte(fmt.Sprintf("h:%d", a.state.Height)),
	}
}

func (a *App) InitChain(req abci.RequestInitChain) abci.ResponseInitChain {
	a.mtx.Lock()
	defer a.mtx.Unlock()
	// We rely on Comet genesis validators. App has its own genesis state.
	a.logger.Info("InitChain", "time", time.Now().String(), "validators", len(req.Validators))
	return abci.ResponseInitChain{}
}

func (a *App) CheckTx(req abci.RequestCheckTx) abci.ResponseCheckTx {
	a.mtx.Lock()
	defer a.mtx.Unlock()
	tx, err := decodeTx(req.Tx)
	if err != nil {
		return abci.ResponseCheckTx{Code: 1, Log: err.Error()}
	}
	// lightweight checks
	if tx.Fee < a.state.Params.FeeBase {
		return abci.ResponseCheckTx{Code: 2, Log: "fee too low"}
	}
	return abci.ResponseCheckTx{Code: 0}
}

func (a *App) FinalizeBlock(req abci.RequestFinalizeBlock) abci.ResponseFinalizeBlock {
	a.mtx.Lock()
	defer a.mtx.Unlock()

	var txResults []abci.ExecTxResult
	for _, raw := range req.Txs {
		tx, err := decodeTx(raw)
		if err != nil {
			txResults = append(txResults, abci.ExecTxResult{Code: 1, Log: err.Error()})
			continue
		}
		if err := a.applyTx(tx); err != nil {
			txResults = append(txResults, abci.ExecTxResult{Code: 2, Log: err.Error()})
			continue
		}
		txResults = append(txResults, abci.ExecTxResult{Code: 0})
	}

	a.state.Height = req.Height
	// persist every block (simple + safe for MVP)
	a.persist()

	return abci.ResponseFinalizeBlock{
		TxResults: txResults,
		AppHash:   []byte(fmt.Sprintf("h:%d", a.state.Height)),
	}
}

func (a *App) Commit(_ abci.RequestCommit) abci.ResponseCommit {
	// CometBFT v0.38 uses FinalizeBlock for state transitions; Commit can be empty.
	return abci.ResponseCommit{RetainHeight: 0}
}

func (a *App) Query(req abci.RequestQuery) abci.ResponseQuery {
	a.mtx.Lock()
	defer a.mtx.Unlock()
	switch req.Path {
	case "/balance":
		addr := string(req.Data)
		bal := a.state.Balances[addr]
		return abci.ResponseQuery{Code: 0, Value: []byte(fmt.Sprintf("%d", bal))}
	case "/treasury":
		return abci.ResponseQuery{Code: 0, Value: []byte(fmt.Sprintf("%d", a.state.Treasury))}
	default:
		return abci.ResponseQuery{Code: 1, Log: "unknown query path"}
	}
}

func main() {
	logger := log.NewTMLogger(log.NewSyncWriter(os.Stdout))
	snapshot := os.Getenv("APP_SNAPSHOT")
	if snapshot == "" {
		snapshot = "./state.json"
	}
	app := NewApp(logger, snapshot)

	// Comet connects to the ABCI app over TCP using `--proxy_app`.
	abciSrv := abciserver.NewServer("tcp://0.0.0.0:27158", "socket", app)
	if err := abciSrv.Start(); err != nil {
		panic(err)
	}
	defer func() { _ = abciSrv.Stop() }()

	logger.Info("ABCI app listening", "addr", "tcp://0.0.0.0:27158", "snapshot", snapshot)
	select {}
}
