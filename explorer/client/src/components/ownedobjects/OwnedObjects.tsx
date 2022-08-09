// Copyright (c) 2022, Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Coin, getObjectFields, getObjectId } from '@mysten/sui.js';
import BN from 'bn.js';
import React, {
    useCallback,
    useEffect,
    useState,
    useContext,
    createContext,
} from 'react';
import { useNavigate } from 'react-router-dom';

import { ReactComponent as ContentIcon } from '../../assets/SVGIcons/closed-content.svg';
import tablestyle from '../../components/table/TableCard.module.css';
import { NetworkContext } from '../../context';
import { DefaultRpcClient as rpc } from '../../utils/api/DefaultRpcClient';
import { IS_STATIC_ENV } from '../../utils/envUtil';
import { parseImageURL, parseObjectType } from '../../utils/objectUtils';
import { navigateWithUnknown } from '../../utils/searchUtil';
import {
    findDataFromID,
    findOwnedObjectsfromID,
} from '../../utils/static/searchUtil';
import {
    handleCoinType,
    transformURL,
    trimStdLibPrefix,
    truncate,
} from '../../utils/stringUtils';
import DisplayBox from '../displaybox/DisplayBox';
import Longtext from '../longtext/Longtext';
import Pagination from '../pagination/Pagination';
import PaginationLogic from '../pagination/PaginationLogic';

import styles from './OwnedObjects.module.css';

type resultType = {
    id: string;
    Type: string;
    _isCoin: boolean;
    Version?: string;
    display?: string;
    balance?: BN;
}[];

const DATATYPE_DEFAULT: resultType = [
    {
        id: '',
        Type: '',
        _isCoin: false,
    },
];

const ITEMS_PER_PAGE: number = 6;
const alttextgen = (value: number | string | boolean | BN): string =>
    truncate(String(value), 19);

const lastRowHas2Elements = (itemList: any[]): boolean =>
    itemList.length % 3 === 2;

const NoOwnedObjects = () => (
    <div className={styles.fail}>Failed to find Owned Objects</div>
);

const OwnedObject = ({ id, byAddress }: { id: string; byAddress: boolean }) =>
    IS_STATIC_ENV ? (
        <OwnedObjectStatic id={id} />
    ) : (
        <OwnedObjectAPI id={id} byAddress={byAddress} />
    );

const NavigateFunctionContext = createContext<(id: string) => () => void>(
    (id: string) => () => {}
);

function OwnedObjectStatic({ id }: { id: string }) {
    const navigate = useNavigate();

    const navigateFn = useCallback(
        (id: string) => () => navigateWithUnknown(id, navigate),
        [navigate]
    );

    const objects = findOwnedObjectsfromID(id);

    if (objects) {
        const results = objects.map(({ objectId }) => {
            const entry = findDataFromID(objectId, undefined);
            const convertToBN = (balance: string): BN => new BN.BN(balance, 10);
            return {
                id: entry?.id,
                Type: entry?.objType,
                Version: entry?.version,
                display: entry?.data?.contents?.display,
                balance: convertToBN(entry?.data?.contents?.balance),
                _isCoin: entry?.data?.contents?.balance !== undefined,
            };
        });

        return (
            <NavigateFunctionContext.Provider value={navigateFn}>
                <OwnedObjectLayout results={results} />
            </NavigateFunctionContext.Provider>
        );
    } else {
        return <NoOwnedObjects />;
    }
}

function OwnedObjectAPI({ id, byAddress }: { id: string; byAddress: boolean }) {
    const [results, setResults] = useState(DATATYPE_DEFAULT);
    const [isLoaded, setIsLoaded] = useState(false);
    const [isFail, setIsFail] = useState(false);
    const [network] = useContext(NetworkContext);
    const navigate = useNavigate();
    const navigateFn = useCallback(
        (id: string) => () => navigateWithUnknown(id, navigate, network),
        [navigate, network]
    );

    useEffect(() => {
        setIsFail(false);
        setIsLoaded(false);
        const req = byAddress
            ? rpc(network).getObjectsOwnedByAddress(id)
            : rpc(network).getObjectsOwnedByObject(id);

        req.then((objects) => {
            const ids = objects.map(({ objectId }) => objectId);
            rpc(network)
                .getObjectBatch(ids)
                .then((results) => {
                    setResults(
                        results
                            .filter(({ status }) => status === 'Exists')
                            .map(
                                (resp) => {
                                    const contents = getObjectFields(resp);
                                    const url = parseImageURL(contents);
                                    const objType = parseObjectType(resp);
                                    const balanceValue = Coin.getBalance(resp);
                                    return {
                                        id: getObjectId(resp),
                                        Type: objType,
                                        _isCoin: Coin.isCoin(resp),
                                        display: url
                                            ? transformURL(url)
                                            : undefined,
                                        balance: balanceValue,
                                    };
                                }
                                // TODO - add back version
                            )
                    );
                    setIsLoaded(true);
                });
        }).catch(() => setIsFail(true));
    }, [id, network, byAddress]);

    if (isFail) return <NoOwnedObjects />;

    if (isLoaded)
        return (
            <NavigateFunctionContext.Provider value={navigateFn}>
                <OwnedObjectLayout results={results} />
            </NavigateFunctionContext.Provider>
        );

    return <div className={styles.gray}>loading...</div>;
}

const viewFn = (results: any) => <OwnedObjectView results={results} />;

function OwnedObjectLayout({ results }: { results: resultType }) {
    const coin_results = results.filter(({ _isCoin }) => _isCoin);
    const other_results = results
        .filter(({ _isCoin }) => !_isCoin)
        .sort((a, b) => {
            if (a.Type > b.Type) return 1;
            if (a.Type < b.Type) return -1;
            if (a.Type === b.Type) {
                return a.id <= b.id ? -1 : 1;
            }
            return 0;
        });

    const nftFooter = {
        stats: {
            count: other_results.length,
            stats_text: 'Total NFTs',
        },
    };

    return (
        <div className={styles.layout}>
            {coin_results.length > 0 && (
                <div>
                    <div className={styles.ownedobjectheader}>
                        <h2>Coins</h2>
                    </div>
                    <GroupView results={coin_results} />
                </div>
            )}
            {other_results.length > 0 && (
                <div id="NFTSection">
                    <div className={styles.ownedobjectheader}>
                        <h2>NFTs</h2>
                    </div>
                    <PaginationLogic
                        results={other_results}
                        viewComponentFn={viewFn}
                        itemsPerPage={ITEMS_PER_PAGE}
                        stats={nftFooter.stats}
                    />
                </div>
            )}
        </div>
    );
}

function GroupView({ results }: { results: resultType }) {
    const CLOSED_TYPE_STRING = '';

    const [openedType, setOpenedType] = useState(CLOSED_TYPE_STRING);

    const [currentPage, setCurrentPage] = useState(1);

    const openThisType = useCallback(
        (thisType: string) => () => {
            setOpenedType(thisType);
        },
        []
    );

    const goBack = useCallback(() => setOpenedType(CLOSED_TYPE_STRING), []);

    const uniqueTypes = Array.from(new Set(results.map(({ Type }) => Type)));

    // Switching the page closes any open group:
    useEffect(() => {
        setOpenedType(CLOSED_TYPE_STRING);
    }, [currentPage]);

    return (
        <>
            <table
                id="groupCollection"
                className={`${styles.groupview} ${tablestyle.table}`}
            >
                <thead>
                    <tr>
                        <th />
                        <th>Type</th>
                        <th>Objects</th>
                        <th>Balance</th>
                        <th />
                    </tr>
                </thead>
                <>
                    {uniqueTypes
                        .slice(
                            (currentPage - 1) * ITEMS_PER_PAGE,
                            currentPage * ITEMS_PER_PAGE
                        )
                        .map((typeV) => {
                            const subObjList = results.filter(
                                ({ Type }) => Type === typeV
                            );
                            return (
                                <tbody
                                    key={typeV}
                                    className={
                                        openedType === typeV
                                            ? styles.openedgroup
                                            : styles.closedgroup
                                    }
                                >
                                    <tr
                                        onClick={
                                            openedType === typeV
                                                ? goBack
                                                : openThisType(typeV)
                                        }
                                    >
                                        <td>
                                            <span className={styles.icon}>
                                                <ContentIcon />
                                            </span>
                                        </td>
                                        <td>{handleCoinType(typeV)}</td>
                                        <td>{subObjList.length}</td>
                                        <td>
                                            {subObjList[0]._isCoin &&
                                            subObjList.every(
                                                (el) => el.balance !== undefined
                                            )
                                                ? `${subObjList.reduce(
                                                      (prev, current) =>
                                                          prev.add(
                                                              current.balance!
                                                          ),
                                                      Coin.getZero()
                                                  )}`
                                                : ''}
                                        </td>
                                        <td />
                                    </tr>
                                    {openedType === typeV &&
                                        subObjList.map((subObj, index) => (
                                            <React.Fragment
                                                key={`${typeV}${index}`}
                                            >
                                                <tr>
                                                    <td />
                                                    <td>Object ID</td>
                                                    <td colSpan={2}>
                                                        <Longtext
                                                            text={subObj.id}
                                                            category="objects"
                                                            isCopyButton={false}
                                                        />
                                                    </td>
                                                    <td />
                                                </tr>
                                                <tr>
                                                    <td />
                                                    <td>Balance</td>
                                                    <td colSpan={2}>
                                                        {subObj.balance?.toString()}
                                                    </td>
                                                    <td />
                                                </tr>
                                            </React.Fragment>
                                        ))}
                                </tbody>
                            );
                        })}
                </>
            </table>
            <Pagination
                totalItems={uniqueTypes.length}
                itemsPerPage={ITEMS_PER_PAGE}
                currentPage={currentPage}
                onPagiChangeFn={setCurrentPage}
            />
        </>
    );
}

function OwnedObjectView({ results }: { results: resultType }) {
    return (
        <div id="ownedObjects" className={styles.ownedobjects}>
            {results.map((entryObj, index1) => (
                <div className={styles.objectbox} key={`object-${index1}`}>
                    {entryObj.display !== undefined && (
                        <div className={styles.previewimage}>
                            <DisplayBox display={entryObj.display} />
                        </div>
                    )}
                    <div className={styles.textitem}>
                        {Object.entries(entryObj).map(
                            ([key, value], index2) => (
                                <div key={`object-${index1}-${index2}`}>
                                    {(() => {
                                        switch (key) {
                                            case 'Type':
                                                if (entryObj._isCoin) {
                                                    break;
                                                } else {
                                                    return (
                                                        <span
                                                            className={
                                                                styles.typevalue
                                                            }
                                                        >
                                                            {trimStdLibPrefix(
                                                                value as string
                                                            )}
                                                        </span>
                                                    );
                                                }
                                            case 'balance':
                                                if (!entryObj._isCoin) {
                                                    break;
                                                } else {
                                                    return (
                                                        <div
                                                            className={
                                                                styles.coinfield
                                                            }
                                                        >
                                                            <div>Balance</div>
                                                            <div>
                                                                {String(value)}
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                            case 'id':
                                                if (entryObj._isCoin) {
                                                    return (
                                                        <div
                                                            className={
                                                                styles.coinfield
                                                            }
                                                        >
                                                            <div>Object ID</div>
                                                            <div>
                                                                <Longtext
                                                                    text={String(
                                                                        value
                                                                    )}
                                                                    category="objects"
                                                                    isCopyButton={
                                                                        false
                                                                    }
                                                                    alttext={alttextgen(
                                                                        value
                                                                    )}
                                                                />
                                                            </div>
                                                        </div>
                                                    );
                                                } else {
                                                    return (
                                                        <Longtext
                                                            text={String(value)}
                                                            category="objects"
                                                            isCopyButton={false}
                                                            alttext={alttextgen(
                                                                value
                                                            )}
                                                        />
                                                    );
                                                }
                                            default:
                                                break;
                                        }
                                    })()}
                                </div>
                            )
                        )}
                    </div>
                </div>
            ))}
            {lastRowHas2Elements(results) && (
                <div className={`${styles.objectbox} ${styles.fillerbox}`} />
            )}
        </div>
    );
}

export default OwnedObject;
